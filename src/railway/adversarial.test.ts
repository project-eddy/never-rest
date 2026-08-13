import { err, ok, Result, ResultAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { ContractDef } from '../contract/types.js';
import { railError } from '../error.js';
import { serve, type Handlers } from '../server/serve.js';
import { assertProtocolResponse as assertRaw } from './assert-protocol.js';

async function assertProtocolResponse(
  options: Omit<Parameters<typeof assertRaw>[0], 'expect'>,
) {
  return assertRaw({ ...options, expect });
}

const output = z.object({ id: z.string(), name: z.string() });

const adversarialContract = {
  getItem: {
    method: 'GET',
    path: '/items/:id',
    params: z.object({ id: z.string() }),
    output,
    errors: { not_found: 404 },
  },
} as const satisfies ContractDef;

const CONSTANT_INTERNAL_BODY =
  '{"code":"internal","message":"An unexpected error occurred"}';

describe('railway adversarial combinators', () => {
  it('normalises mapErr to internal at public disclosure', async () => {
    const secret = 'postgres://admin:secret@db.internal';
    const handlers: Handlers<typeof adversarialContract, undefined> = {
      getItem: () =>
        err(railError('not_found', 'missing')).mapErr(
          () => railError('internal', secret) as never,
        ),
    };

    const api = serve(adversarialContract, handlers, {});
    const response = await api(
      new Request('http://example.test/items/i1'),
      undefined,
    );
    const body = await assertProtocolResponse({
      response,
      declaredCodes: ['not_found'],
      forbidSubstrings: [secret, 'postgres://'],
    });

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      code: 'internal',
      message: 'An unexpected error occurred',
    });
  });

  it('normalises mapErr to validation_error the same way', async () => {
    const secret = 'leaked-validation-detail';
    const handlers: Handlers<typeof adversarialContract, undefined> = {
      getItem: () =>
        err(railError('not_found', 'missing')).mapErr(
          () => railError('validation_error', secret) as never,
        ),
    };

    const api = serve(adversarialContract, handlers, {});
    const response = await api(
      new Request('http://example.test/items/i1'),
      undefined,
    );
    await assertProtocolResponse({
      response,
      declaredCodes: ['not_found'],
      forbidSubstrings: [secret],
    });
    expect(response.status).toBe(500);
  });

  it('survives combineWithAllErrors returned without mapErr', async () => {
    const handlers: Handlers<typeof adversarialContract, undefined> = {
      getItem: () =>
        Result.combineWithAllErrors([
          err(railError('not_found', 'a')),
          err(railError('not_found', 'b')),
        ]) as never,
    };

    const api = serve(adversarialContract, handlers, {});
    const response = await api(
      new Request('http://example.test/items/i1'),
      undefined,
    );
    await assertProtocolResponse({
      response,
      declaredCodes: ['not_found'],
    });
    expect(response.status).toBe(500);
  });

  it('catches a throw inside map on ResultAsync', async () => {
    const handlers: Handlers<typeof adversarialContract, undefined> = {
      getItem: ({ params }) =>
        ResultAsync.fromSafePromise(
          Promise.resolve({ id: params.id, name: 'Ada' }),
        ).map(() => {
          throw new Error('map exploded');
        }),
    };

    const api = serve(adversarialContract, handlers, {});
    const response = await api(
      new Request('http://example.test/items/i1'),
      undefined,
    );
    const body = await assertProtocolResponse({
      response,
      declaredCodes: ['not_found'],
    });
    expect(body).toMatchObject({ code: 'internal' });
  });

  it('andTee throws are swallowed by neverthrow (Ok preserved)', async () => {
    const handlers: Handlers<typeof adversarialContract, undefined> = {
      getItem: ({ params }) =>
        ResultAsync.fromSafePromise(
          Promise.resolve({ id: params.id, name: 'Ada' }),
        ).andTee(() => {
          throw new Error('metrics exploded');
        }),
    };

    const api = serve(adversarialContract, handlers, {});
    const response = await api(
      new Request('http://example.test/items/i1'),
      undefined,
    );
    const body = await assertProtocolResponse({
      response,
      declaredCodes: ['not_found'],
    });
    expect(response.status).toBe(200);
    expect(body).toEqual({ id: 'i1', name: 'Ada' });
  });

  it('catches fromSafePromise of a rejecting promise', async () => {
    const handlers: Handlers<typeof adversarialContract, undefined> = {
      getItem: () =>
        ResultAsync.fromSafePromise(
          Promise.reject(new Error('raw rejection')),
        ) as never,
    };

    const api = serve(adversarialContract, handlers, {});
    const response = await api(
      new Request('http://example.test/items/i1'),
      undefined,
    );
    await assertProtocolResponse({
      response,
      declaredCodes: ['not_found'],
    });
    expect(response.status).toBe(500);
  });

  it('uses the fail-safe body when orElse recovers to a circular Ok', async () => {
    const circularContract = {
      getItem: {
        method: 'GET',
        path: '/items/:id',
        params: z.object({ id: z.string() }),
        output: z.custom<Record<string, unknown>>(
          (value) => typeof value === 'object' && value !== null,
        ),
        errors: { not_found: 404 },
      },
    } as const satisfies ContractDef;

    const handlers: Handlers<typeof circularContract, undefined> = {
      getItem: () =>
        err(railError('not_found', 'missing')).orElse(() => {
          const circular: Record<string, unknown> = { id: 'x', name: 'y' };
          circular.self = circular;
          return ok(circular);
        }),
    };

    const api = serve(circularContract, handlers, {});
    const response = await api(
      new Request('http://example.test/items/i1'),
      undefined,
    );
    const text = await response.text();
    expect(text).toBe(CONSTANT_INTERNAL_BODY);
  });

  it('wraps undeclared andThrough failure at public disclosure', async () => {
    const handlers: Handlers<typeof adversarialContract, undefined> = {
      getItem: ({ params }) =>
        ResultAsync.fromSafePromise(
          Promise.resolve({ id: params.id, name: 'Ada' }),
        ).andThrough(() =>
          err(railError('audit_failed', 'could not audit') as never),
        ),
    };

    const api = serve(adversarialContract, handlers, {});
    const response = await api(
      new Request('http://example.test/items/i1'),
      undefined,
    );
    const body = await assertProtocolResponse({
      response,
      declaredCodes: ['not_found'],
      forbidSubstrings: ['audit_failed', 'could not audit'],
    });
    expect(body).toMatchObject({
      code: 'internal',
      message: 'An unexpected error occurred',
    });
  });

  it('bounds a cyclic cause produced inside the railway', async () => {
    const handlers: Handlers<typeof adversarialContract, undefined> = {
      getItem: () => {
        const inner: { cause?: ReturnType<typeof railError> } = railError(
          'loop',
          'leaf',
        );
        const middle = railError('loop', 'middle', {
          cause: inner as ReturnType<typeof railError>,
        });
        inner.cause = middle;
        return err(
          railError('not_found', 'missing', {
            cause: middle as ReturnType<typeof railError>,
          }),
        );
      },
    };

    const api = serve(adversarialContract, handlers, {
      disclosure: 'full',
    });
    const response = await api(
      new Request('http://example.test/items/i1'),
      undefined,
    );
    await assertProtocolResponse({
      response,
      declaredCodes: ['not_found'],
      disclosure: 'full',
    });
    expect(response.ok || response.status === 404 || response.status === 500).toBe(
      true,
    );
    expect([404, 500]).toContain(response.status);
  });
});
