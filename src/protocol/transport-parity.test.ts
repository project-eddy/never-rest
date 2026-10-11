import { err, ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { ContractDef } from '../contract/types.js';
import { railError } from '../error.js';
import { createDispatcher } from '../local/dispatch.js';
import { definePolicy } from '../policy/define.js';
import { createTestClient } from '../testing/client.js';

const contract = {
  getDoc: {
    method: 'GET',
    path: '/docs/:id',
    params: z.object({ id: z.string().min(1) }),
    output: z.object({ id: z.string(), title: z.string() }),
    errors: { not_found: 404 },
  },
  health: {
    method: 'GET',
    path: '/health',
    output: z.object({ ok: z.literal(true) }),
    errors: {},
  },
} satisfies ContractDef;

const policy = definePolicy(contract, {
  operations: {
    getDoc: ({ principal }) => {
      if (principal === undefined) {
        return err(railError('boundary.unauthenticated', 'Authentication required'));
      }
      return ok(undefined);
    },
    health: 'public',
  },
});

const handlers = {
  getDoc: ({ params }: { params: { id: string } }) =>
    ok({ id: params.id, title: 'Release process' }),
  health: () => ok({ ok: true as const }),
};

describe('transport parity', () => {
  it('returns equivalent scoped results on HTTP and local dispatch', async () => {
    const http = createTestClient(contract, handlers, { policy });
    const local = createDispatcher(contract, handlers, { policy });

    const httpDenied = await http.getDoc({ params: { id: '1' } });
    const localDenied = await local.dispatch('getDoc', { params: { id: '1' } });
    expect(httpDenied._unsafeUnwrapErr().code).toBe('boundary.unauthenticated');
    expect(localDenied._unsafeUnwrapErr().code).toBe('boundary.unauthenticated');

    const httpHealth = await http.health();
    const localHealth = await local.dispatch('health', {});
    expect(httpHealth._unsafeUnwrap()).toEqual({ ok: true });
    expect(localHealth._unsafeUnwrap()).toEqual({ ok: true });
  });

  it('validates input on both transports', async () => {
    const http = createTestClient(contract, handlers);
    const local = createDispatcher(contract, handlers, { disclosure: 'public' });

    const httpInvalid = await http.getDoc({ params: { id: '' } });
    const localInvalid = await local.dispatch('getDoc', { params: { id: '' } });
    expect(httpInvalid._unsafeUnwrapErr().code).toBe('validation_error');
    expect(localInvalid._unsafeUnwrapErr().code).toBe('validation_error');
  });
});
