import { err, ok, Result, ResultAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { ContractDef } from '../contract/types.js';
import { chain, railError } from '../error.js';
import { serve, type Handlers } from '../server/serve.js';
import { assertProtocolResponse as assertRaw } from './assert-protocol.js';

async function assertProtocolResponse(
  options: Omit<Parameters<typeof assertRaw>[0], 'expect'>,
) {
  return assertRaw({ ...options, expect });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

const output = z.object({ id: z.string(), name: z.string() });

const catalogueContract = {
  gate: {
    method: 'GET',
    path: '/gate/:id',
    params: z.object({ id: z.string() }),
    output,
    errors: { unauthorized: 401, not_found: 404 },
  },
  translate: {
    method: 'GET',
    path: '/translate/:id',
    params: z.object({ id: z.string() }),
    output,
    errors: { dependency_failed: 502 },
  },
  transform: {
    method: 'GET',
    path: '/transform/:id',
    params: z.object({ id: z.string() }),
    output,
    errors: { not_found: 404 },
  },
  recover: {
    method: 'GET',
    path: '/recover/:id',
    params: z.object({ id: z.string() }),
    output,
    errors: { not_found: 404 },
  },
  fanOut: {
    method: 'GET',
    path: '/fan-out/:id',
    params: z.object({ id: z.string() }),
    output,
    errors: { dependency_failed: 502 },
  },
  lift: {
    method: 'GET',
    path: '/lift/:id',
    params: z.object({ id: z.string() }),
    output,
    errors: { dependency_failed: 502 },
  },
  bubble: {
    method: 'GET',
    path: '/bubble/:id',
    params: z.object({ id: z.string() }),
    output,
    errors: { not_found: 404 },
  },
} as const satisfies ContractDef;

describe('railway catalogue (declared codes)', () => {
  it('short-circuits a gate on the Err track', async () => {
    let loadRan = false;
    const handlers: Handlers<typeof catalogueContract, undefined> = {
      gate: ({ params }) =>
        (params.id === 'deny'
          ? err(railError('unauthorized', 'No session'))
          : ok({ userId: params.id })
        ).andThen((session) => {
          loadRan = true;
          return ok({ id: session.userId, name: 'Ada' });
        }),
      translate: () => ok({ id: 'x', name: 'x' }),
      transform: () => ok({ id: 'x', name: 'x' }),
      recover: () => ok({ id: 'x', name: 'x' }),
      fanOut: () => ok({ id: 'x', name: 'x' }),
      lift: () => ok({ id: 'x', name: 'x' }),
      bubble: () => ok({ id: 'x', name: 'x' }),
    };

    const api = serve(catalogueContract, handlers, {});
    const response = await api(
      new Request('http://example.test/gate/deny'),
      undefined,
    );
    const body = await assertProtocolResponse({
      response,
      declaredCodes: ['unauthorized', 'not_found'],
    });

    expect(response.status).toBe(401);
    expect(isRecord(body) && body.code).toBe('unauthorized');
    expect(loadRan).toBe(false);
  });

  it('translates a dependency failure onto a declared code', async () => {
    const handlers: Handlers<typeof catalogueContract, undefined> = {
      gate: () => ok({ id: 'x', name: 'x' }),
      translate: () =>
        ResultAsync.fromPromise(Promise.reject(new Error('timed out')), () =>
          railError('dependency_failed', 'Upstream timed out', {
            retryable: true,
          }),
        ).map(() => ({ id: 'x', name: 'x' })),
      transform: () => ok({ id: 'x', name: 'x' }),
      recover: () => ok({ id: 'x', name: 'x' }),
      fanOut: () => ok({ id: 'x', name: 'x' }),
      lift: () => ok({ id: 'x', name: 'x' }),
      bubble: () => ok({ id: 'x', name: 'x' }),
    };

    const api = serve(catalogueContract, handlers, {});
    const response = await api(
      new Request('http://example.test/translate/u1'),
      undefined,
    );
    const body = await assertProtocolResponse({
      response,
      declaredCodes: ['dependency_failed'],
    });

    expect(isRecord(body) && body.code).toBe('dependency_failed');
  });

  it('transforms Ok values with map', async () => {
    const handlers: Handlers<typeof catalogueContract, undefined> = {
      gate: () => ok({ id: 'x', name: 'x' }),
      translate: () => ok({ id: 'x', name: 'x' }),
      transform: ({ params }) =>
        ok({ id: params.id, name: '  ada  ' }).map((user) => ({
          ...user,
          name: user.name.trim().toUpperCase(),
        })),
      recover: () => ok({ id: 'x', name: 'x' }),
      fanOut: () => ok({ id: 'x', name: 'x' }),
      lift: () => ok({ id: 'x', name: 'x' }),
      bubble: () => ok({ id: 'x', name: 'x' }),
    };

    const api = serve(catalogueContract, handlers, {});
    const response = await api(
      new Request('http://example.test/transform/u1'),
      undefined,
    );
    const body = await assertProtocolResponse({
      response,
      declaredCodes: ['not_found'],
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({ id: 'u1', name: 'ADA' });
  });

  it('recovers with orElse onto the success track', async () => {
    const handlers: Handlers<typeof catalogueContract, undefined> = {
      gate: () => ok({ id: 'x', name: 'x' }),
      translate: () => ok({ id: 'x', name: 'x' }),
      transform: () => ok({ id: 'x', name: 'x' }),
      recover: ({ params }) =>
        err(railError('not_found', 'missing')).orElse(() =>
          ok({ id: params.id, name: 'fallback' }),
        ),
      fanOut: () => ok({ id: 'x', name: 'x' }),
      lift: () => ok({ id: 'x', name: 'x' }),
      bubble: () => ok({ id: 'x', name: 'x' }),
    };

    const api = serve(catalogueContract, handlers, {});
    const response = await api(
      new Request('http://example.test/recover/u1'),
      undefined,
    );
    const body = await assertProtocolResponse({
      response,
      declaredCodes: ['not_found'],
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({ id: 'u1', name: 'fallback' });
  });

  it('fans out with Result.combine', async () => {
    const handlers: Handlers<typeof catalogueContract, undefined> = {
      gate: () => ok({ id: 'x', name: 'x' }),
      translate: () => ok({ id: 'x', name: 'x' }),
      transform: () => ok({ id: 'x', name: 'x' }),
      recover: () => ok({ id: 'x', name: 'x' }),
      fanOut: ({ params }) =>
        Result.combine([
          ok({ left: params.id }),
          ok({ right: 'ok' }),
        ]).map(([left, right]) => ({
          id: left.left,
          name: right.right,
        })),
      lift: () => ok({ id: 'x', name: 'x' }),
      bubble: () => ok({ id: 'x', name: 'x' }),
    };

    const api = serve(catalogueContract, handlers, {});
    const response = await api(
      new Request('http://example.test/fan-out/u1'),
      undefined,
    );
    const body = await assertProtocolResponse({
      response,
      declaredCodes: ['dependency_failed'],
    });

    expect(body).toEqual({ id: 'u1', name: 'ok' });
  });

  it('lifts a rejecting promise onto the railway', async () => {
    const handlers: Handlers<typeof catalogueContract, undefined> = {
      gate: () => ok({ id: 'x', name: 'x' }),
      translate: () => ok({ id: 'x', name: 'x' }),
      transform: () => ok({ id: 'x', name: 'x' }),
      recover: () => ok({ id: 'x', name: 'x' }),
      fanOut: () => ok({ id: 'x', name: 'x' }),
      lift: ({ params }) =>
        ResultAsync.fromPromise(Promise.reject(new Error('db down')), () =>
          railError('dependency_failed', 'User lookup failed', {
            retryable: true,
          }),
        ).map(() => ({ id: params.id, name: 'unreachable' })),
      bubble: () => ok({ id: 'x', name: 'x' }),
    };

    const api = serve(catalogueContract, handlers, {});
    const response = await api(
      new Request('http://example.test/lift/u1'),
      undefined,
    );
    const body = await assertProtocolResponse({
      response,
      declaredCodes: ['dependency_failed'],
    });

    expect(isRecord(body) && body.code).toBe('dependency_failed');
  });

  it('bubbles a cause chain with chain()', async () => {
    const handlers: Handlers<typeof catalogueContract, undefined> = {
      gate: () => ok({ id: 'x', name: 'x' }),
      translate: () => ok({ id: 'x', name: 'x' }),
      transform: () => ok({ id: 'x', name: 'x' }),
      recover: () => ok({ id: 'x', name: 'x' }),
      fanOut: () => ok({ id: 'x', name: 'x' }),
      lift: () => ok({ id: 'x', name: 'x' }),
      bubble: () =>
        err(
          chain(
            { code: 'not_found', message: 'User missing' },
            railError('lookup_failed', 'Index miss', { origin: 'store' }),
          ),
        ),
    };

    const api = serve(catalogueContract, handlers, {
      disclosure: 'full',
    });
    const response = await api(
      new Request('http://example.test/bubble/u1'),
      undefined,
    );
    const body = await assertProtocolResponse({
      response,
      declaredCodes: ['not_found'],
      disclosure: 'full',
    });

    expect(isRecord(body) && body.code).toBe('not_found');
    expect(isRecord(body) && body.cause).toMatchObject({
      code: 'lookup_failed',
      origin: 'store',
    });
  });
});
