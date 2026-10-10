import { err, errAsync, ok, okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ContractConfigurationError } from '../contract/compile.js';
import type { ContractDef } from '../contract/types.js';
import { railError } from '../error.js';
import { createDispatcher } from '../local/dispatch.js';
import { serve } from '../server/serve.js';
import { definePolicy } from './define.js';

const contract = {
  getDoc: {
    method: 'GET',
    path: '/docs/:id',
    params: z.object({ id: z.string() }),
    output: z.object({ id: z.string() }),
    errors: { not_found: 404 },
  },
  health: {
    method: 'GET',
    path: '/health',
    output: z.object({ ok: z.literal(true) }),
    errors: {},
  },
} satisfies ContractDef;

describe('definePolicy', () => {
  it('Throwing when an operation is missing from the policy map', () => {
    expect(() =>
      definePolicy(contract, {
        operations: {
          getDoc: 'public',
        } as never,
      }),
    ).toThrow(ContractConfigurationError);
  });

  it('throws when the policy map lists an unknown operation', () => {
    expect(() =>
      definePolicy(contract, {
        operations: {
          getDoc: 'public',
          health: 'public',
          extra: 'public',
        } as never,
      }),
    ).toThrow(ContractConfigurationError);
  });

  it('rejects serve construction when policy and disclosure are both set', () => {
    const policy = definePolicy(contract, {
      operations: { getDoc: 'public', health: 'public' },
    });
    expect(() =>
      serve(
        contract,
        {
          getDoc: ({ params }) => ok({ id: params.id }),
          health: () => ok({ ok: true as const }),
        },
        { policy, disclosure: 'public' },
      ),
    ).toThrow(ContractConfigurationError);
  });

  it('Returning unauthenticated for a protected local call without a principal', async () => {
    const policy = definePolicy(contract, {
      operations: {
        getDoc: () => okAsync(undefined),
        health: 'public',
      },
    });
    const dispatcher = createDispatcher(
      contract,
      {
        getDoc: ({ params }) => ok({ id: params.id }),
        health: () => ok({ ok: true as const }),
      },
      { policy },
    );

    const result = await dispatcher.dispatch('getDoc', { params: { id: '1' } });

    expect(result._unsafeUnwrapErr().code).toBe('boundary.unauthenticated');
  });

  it('Turning a throwing verifier into an unauthenticated HTTP error', async () => {
    const policy = definePolicy(contract, {
      verify: () => {
        throw new Error('boom');
      },
      operations: {
        getDoc: () => okAsync(undefined),
        health: 'public',
      },
    });
    const handler = serve(
      contract,
      {
        getDoc: ({ params }) => ok({ id: params.id }),
        health: () => ok({ ok: true as const }),
      },
      { policy },
    );

    const response = await handler(
      new Request('http://localhost/docs/1'),
      undefined,
    );
    const body = (await response.json()) as { code: string };

    expect(response.status).toBe(401);
    expect(body.code).toBe('boundary.unauthenticated');
  });

  it('turns a throwing authorizer into a forbidden error', async () => {
    const policy = definePolicy(contract, {
      operations: {
        getDoc: () => {
          throw new Error('nope');
        },
        health: 'public',
      },
    });
    const dispatcher = createDispatcher(
      contract,
      {
        getDoc: ({ params }) => ok({ id: params.id }),
        health: () => ok({ ok: true as const }),
      },
      { policy },
    );

    const result = await dispatcher.dispatch(
      'getDoc',
      { params: { id: '1' } },
      { principal: { id: 'ada' } },
    );

    expect(result._unsafeUnwrapErr().code).toBe('boundary.forbidden');
  });

  it('authorizes after parsing and can read the validated args', async () => {
    const seen: string[] = [];
    const policy = definePolicy(contract, {
      operations: {
        getDoc: ({ args }) => {
          seen.push(args.params.id);
          return err(railError('not_found', 'hidden'));
        },
        health: 'public',
      },
    });
    const dispatcher = createDispatcher(
      contract,
      {
        getDoc: ({ params }) => ok({ id: params.id }),
        health: () => ok({ ok: true as const }),
      },
      { policy },
    );

    const result = await dispatcher.dispatch(
      'getDoc',
      { params: { id: 'doc-9' } },
      { principal: { id: 'ada' } },
    );

    expect(seen).toEqual(['doc-9']);
    expect(result.isErr()).toBe(true);
  });

  it('Letting a public operation run without a principal', async () => {
    const policy = definePolicy(contract, {
      operations: {
        getDoc: () => errAsync(railError('not_found', 'no')),
        health: 'public',
      },
    });
    const dispatcher = createDispatcher(
      contract,
      {
        getDoc: ({ params }) => ok({ id: params.id }),
        health: () => ok({ ok: true as const }),
      },
      { policy },
    );

    const result = await dispatcher.dispatch('health', {});

    expect(result._unsafeUnwrap()).toEqual({ ok: true });
  });
});
