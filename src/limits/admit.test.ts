import { errAsync, ok, okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { ContractDef } from '../contract/types.js';
import { ContractConfigurationError } from '../contract/compile.js';
import { railError } from '../error.js';
import { createDispatcher } from '../local/dispatch.js';
import { serve } from '../server/serve.js';
import {
  acquireConcurrency,
  admitAnonymous,
  admitPrincipal,
  assertAdmissionOptions,
} from './admit.js';
import { createConcurrencyGate } from './concurrency.js';
import { createMemoryLimiter } from './memory.js';
import type { Limiter } from './types.js';

const contract = {
  ping: {
    method: 'GET',
    path: '/ping',
    output: z.object({ ok: z.literal(true) }),
    errors: {},
  },
} as const satisfies ContractDef;

const handlers = {
  ping: () => ok({ ok: true as const }),
};

function failingLimiter(): Limiter {
  return {
    consume() {
      return errAsync(railError('limiter_unavailable', 'store down'));
    },
  };
}

function limitedLimiter(): Limiter {
  return {
    consume() {
      return okAsync({ kind: 'limited' as const, retryAfterMs: 250 });
    },
  };
}

describe('assertAdmissionOptions', () => {
  it('requires onStoreFailure when admission is set', () => {
    expect(() =>
      serve(contract, handlers, {
        admission: {
          anonymous: { limiter: createMemoryLimiter({ points: 1, durationMs: 1_000, maxKeys: 4 }), key: 'anon' },
        } as never,
      }),
    ).toThrow(ContractConfigurationError);
  });

  it('allows omitted admission', () => {
    expect(() => assertAdmissionOptions(undefined)).not.toThrow();
  });
});

describe('admitAnonymous', () => {
  it('allows then rate-limits a string key', async () => {
    const limiter = createMemoryLimiter({ points: 1, durationMs: 60_000, maxKeys: 4 });
    const admission = {
      anonymous: { limiter, key: 'anon' },
      onStoreFailure: 'reject' as const,
    };
    const first = await admitAnonymous(admission, {}, 'ping');
    const second = await admitAnonymous(admission, {}, 'ping');
    expect(first.isOk()).toBe(true);
    expect(second._unsafeUnwrapErr().code).toBe('boundary.rate_limited');
  });

  it('resolves a function key from the request', async () => {
    const limiter = createMemoryLimiter({ points: 1, durationMs: 60_000, maxKeys: 4 });
    const admission = {
      anonymous: {
        limiter,
        key: ({ request }: { request?: Request }) =>
          request?.headers.get('x-edge-client-key') ?? 'anon',
      },
      cost: () => 1,
      onStoreFailure: 'reject' as const,
    };
    const request = new Request('http://test.local/ping', {
      headers: { 'x-edge-client-key': 'edge-1' },
    });
    const first = await admitAnonymous(admission, { request }, 'ping');
    const second = await admitAnonymous(admission, { request }, 'ping');
    expect(first.isOk()).toBe(true);
    expect(second._unsafeUnwrapErr().code).toBe('boundary.rate_limited');
  });

  it('rejects when the store fails and onStoreFailure is reject', async () => {
    const result = await admitAnonymous(
      { anonymous: { limiter: failingLimiter(), key: 'anon' }, onStoreFailure: 'reject' },
      {},
      'ping',
    );
    expect(result._unsafeUnwrapErr().code).toBe('boundary.overloaded');
  });

  it('uses the fallback limiter after a store failure', async () => {
    const fallback = createMemoryLimiter({ points: 1, durationMs: 60_000, maxKeys: 4 });
    const admission = {
      anonymous: { limiter: failingLimiter(), key: 'anon' },
      onStoreFailure: { fallback },
    };
    const first = await admitAnonymous(admission, {}, 'ping');
    const second = await admitAnonymous(admission, {}, 'ping');
    expect(first.isOk()).toBe(true);
    expect(second._unsafeUnwrapErr().code).toBe('boundary.rate_limited');
  });

  it('rejects when the fallback store also fails', async () => {
    const result = await admitAnonymous(
      {
        anonymous: { limiter: failingLimiter(), key: 'anon' },
        onStoreFailure: { fallback: failingLimiter() },
      },
      {},
      'ping',
    );
    expect(result._unsafeUnwrapErr().code).toBe('boundary.overloaded');
  });
});

describe('admitPrincipal', () => {
  it('skips when no principal is present', async () => {
    const result = await admitPrincipal(
      {
        principal: {
          limiter: limitedLimiter(),
          key: (principal: { id: string }) => principal.id,
        },
        onStoreFailure: 'reject',
      },
      undefined,
      'ping',
    );
    expect(result.isOk()).toBe(true);
  });

  it('uses unit cost when no cost function is set', async () => {
    const limiter = createMemoryLimiter({ points: 1, durationMs: 60_000, maxKeys: 4 });
    const admission = {
      principal: {
        limiter,
        key: (principal: { id: string }) => principal.id,
      },
      onStoreFailure: 'reject' as const,
    };
    const first = await admitPrincipal(admission, { id: 'ada' }, 'ping');
    const second = await admitPrincipal(admission, { id: 'ada' }, 'ping');
    expect(first.isOk()).toBe(true);
    expect(second._unsafeUnwrapErr().code).toBe('boundary.rate_limited');
  });

  it('limits a named principal', async () => {
    const limiter = createMemoryLimiter({ points: 1, durationMs: 60_000, maxKeys: 4 });
    const admission = {
      principal: {
        limiter,
        key: (principal: { id: string }) => principal.id,
      },
      cost: (operation: string) => (operation === 'ping' ? 1 : 2),
      onStoreFailure: 'reject' as const,
    };
    const first = await admitPrincipal(admission, { id: 'ada' }, 'ping');
    const second = await admitPrincipal(admission, { id: 'ada' }, 'ping');
    expect(first.isOk()).toBe(true);
    expect(second._unsafeUnwrapErr().code).toBe('boundary.rate_limited');
  });
});

describe('acquireConcurrency', () => {
  it('returns a no-op release when no gate is configured', async () => {
    const slot = await acquireConcurrency(undefined, new AbortController().signal, 'ping');
    const release = slot._unsafeUnwrap();
    release();
    release();
  });

  it('acquires a configured gate', async () => {
    const admission = {
      concurrency: createConcurrencyGate({
        maxInFlight: 1,
        maxQueue: 0,
        queueTimeoutMs: 50,
      }),
      onStoreFailure: 'reject' as const,
    };
    const slot = await acquireConcurrency(
      admission,
      new AbortController().signal,
      'ping',
    );
    expect(slot.isOk()).toBe(true);
    slot._unsafeUnwrap()();
  });
});

describe('admission through serve and dispatch', () => {
  it('returns 429 when the anonymous limiter is exhausted', async () => {
    const handler = serve(contract, handlers, {
      admission: {
        anonymous: {
          limiter: createMemoryLimiter({ points: 1, durationMs: 60_000, maxKeys: 4 }),
          key: 'anon',
        },
        onStoreFailure: 'reject',
      },
    });
    const first = await handler(new Request('http://test.local/ping'), undefined);
    const second = await handler(new Request('http://test.local/ping'), undefined);
    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(((await second.json()) as { code: string }).code).toBe(
      'boundary.rate_limited',
    );
  });

  it('returns overloaded on a local dispatcher when the store fails', async () => {
    const dispatcher = createDispatcher(contract, handlers, {
      admission: {
        anonymous: { limiter: failingLimiter(), key: 'anon' },
        onStoreFailure: 'reject',
      },
    });
    const result = await dispatcher.dispatch('ping', {});
    expect(result._unsafeUnwrapErr().code).toBe('boundary.overloaded');
  });
});
