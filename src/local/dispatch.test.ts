import { err, ok, okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ContractConfigurationError } from '../contract/compile.js';
import type { ContractDef } from '../contract/types.js';
import { railError } from '../error.js';
import { createDispatcher, createLocalClient } from './dispatch.js';
import type { LocalHandlers } from './types.js';

const claimSchema = z.object({
  zone: z.string(),
  holder: z.string(),
});

const contract = {
  getClaim: {
    method: 'GET',
    path: '/claims/:zone',
    params: z.object({ zone: z.string() }),
    output: claimSchema,
    errors: { not_found: 404 },
    summary: 'Read the current claim on a zone',
  },
  claimZone: {
    method: 'POST',
    path: '/claims',
    body: z.object({ zone: z.string().min(1), holder: z.string().min(1) }),
    output: claimSchema,
    errors: { conflict: 409 },
  },
  listClaims: {
    method: 'GET',
    path: '/claims',
    output: z.array(claimSchema),
    errors: {},
  },
} satisfies ContractDef;

type Context = { readonly agent: string };

const handlers: LocalHandlers<typeof contract, Context> = {
  getClaim: ({ params }) => ok({ zone: params.zone, holder: 'agent-1' }),
  claimZone: ({ body, context }) =>
    ok({ zone: body.zone, holder: context.agent }),
  listClaims: () => okAsync([{ zone: 'core', holder: 'agent-1' }]),
};

describe('createLocalClient', () => {
  it('returns declared output without a Request or Response', async () => {
    const client = createLocalClient(contract, handlers, {
      context: { agent: 'agent-9' },
    });

    const result = await client.getClaim({ params: { zone: 'core' } });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ zone: 'core', holder: 'agent-1' });
  });

  it('passes bound context to the handler', async () => {
    const client = createLocalClient(contract, handlers, {
      context: { agent: 'agent-9' },
    });

    const result = await client.claimZone({
      body: { zone: 'docs', holder: 'ignored' },
    });

    expect(result._unsafeUnwrap()).toEqual({ zone: 'docs', holder: 'agent-9' });
  });

  it('accepts a handler returning ResultAsync', async () => {
    const client = createLocalClient(contract, handlers, {
      context: { agent: 'agent-9' },
    });

    const result = await client.listClaims({});

    expect(result._unsafeUnwrap()).toEqual([{ zone: 'core', holder: 'agent-1' }]);
  });

  it('accepts a handler returning a Promise of Result', async () => {
    const client = createLocalClient(
      contract,
      {
        ...handlers,
        getClaim: async ({ params }) =>
          Promise.resolve(ok({ zone: params.zone, holder: 'async-agent' })),
      },
      { context: { agent: 'agent-9' } },
    );

    const result = await client.getClaim({ params: { zone: 'core' } });

    expect(result._unsafeUnwrap()).toEqual({
      zone: 'core',
      holder: 'async-agent',
    });
  });

  it('validates input against the declared schema', async () => {
    const client = createLocalClient(contract, handlers, {
      context: { agent: 'agent-9' },
    });

    const result = await client.claimZone({ body: { zone: '', holder: 'a' } });

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe('validation_error');
    expect(error.issues?.[0]?.path).toEqual(['body', 'zone']);
  });

  it('surfaces a declared domain error unchanged', async () => {
    const client = createLocalClient(
      contract,
      {
        ...handlers,
        getClaim: () => err(railError('not_found', 'No claim on that zone')),
      },
      { context: { agent: 'agent-9' } },
    );

    const result = await client.getClaim({ params: { zone: 'ghost' } });

    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'not_found',
      message: 'No claim on that zone',
    });
  });

  it('reports output that violates the contract as internal', async () => {
    const client = createLocalClient(
      contract,
      {
        ...handlers,
        getClaim: () => ok({ zone: 'core' } as never),
      },
      { context: { agent: 'agent-9' } },
    );

    const result = await client.getClaim({ params: { zone: 'core' } });

    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe('internal');
    expect(error.cause?.code).toBe('output_validation_failed');
  });

  it('converts a thrown handler into an internal rail error', async () => {
    const client = createLocalClient(
      contract,
      {
        ...handlers,
        getClaim: () => {
          throw new Error('handler exploded');
        },
      },
      { context: { agent: 'agent-9' } },
    );

    const result = await client.getClaim({ params: { zone: 'core' } });

    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe('internal');
    expect(error.cause?.message).toBe('handler exploded');
  });

  it('throws at construction when a handler is missing', () => {
    expect(() =>
      createLocalClient(
        contract,
        { getClaim: handlers.getClaim } as LocalHandlers<
          typeof contract,
          Context
        >,
        { context: { agent: 'agent-9' } },
      ),
    ).toThrow(ContractConfigurationError);
  });
});

describe('createDispatcher', () => {
  const dispatcher = createDispatcher(contract, handlers, {
    context: { agent: 'agent-9' },
    origin: 'atc',
  });

  it('enumerates the contract operations', () => {
    expect(dispatcher.operations).toEqual([
      'getClaim',
      'claimZone',
      'listClaims',
    ]);
  });

  it('dispatches by operation name', async () => {
    const result = await dispatcher.dispatch('getClaim', {
      params: { zone: 'core' },
    });

    expect(result._unsafeUnwrap()).toEqual({ zone: 'core', holder: 'agent-1' });
  });

  it('returns route_not_found for an unknown operation', async () => {
    const result = await dispatcher.dispatch('nope', {});

    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe('route_not_found');
    expect(error.message).toContain('nope');
  });

  it('stamps origin on errors it raises', async () => {
    const result = await dispatcher.dispatch('claimZone', {
      body: { zone: '', holder: 'a' },
    });

    expect(result._unsafeUnwrapErr().origin).toBe('atc');
  });

  it('leaves an origin already set by the handler intact', async () => {
    const local = createDispatcher(
      contract,
      {
        ...handlers,
        getClaim: () =>
          err(railError('not_found', 'Missing', { origin: 'garden' })),
      },
      { context: { agent: 'agent-9' }, origin: 'atc' },
    );

    const result = await local.dispatch('getClaim', { params: { zone: 'x' } });

    expect(result._unsafeUnwrapErr().origin).toBe('garden');
  });

  it('prefers per-call context over bound context', async () => {
    const result = await dispatcher.dispatch(
      'claimZone',
      { body: { zone: 'docs', holder: 'ignored' } },
      { agent: 'agent-override' },
    );

    expect(result._unsafeUnwrap()).toEqual({
      zone: 'docs',
      holder: 'agent-override',
    });
  });

  it('defaults to full disclosure so the cause chain survives', async () => {
    const local = createDispatcher(
      contract,
      {
        ...handlers,
        getClaim: () => {
          throw new Error('inner detail');
        },
      },
      { context: { agent: 'agent-9' } },
    );

    const result = await local.dispatch('getClaim', { params: { zone: 'x' } });

    expect(result._unsafeUnwrapErr().cause?.message).toBe('inner detail');
  });

  it('honours a narrower disclosure when asked', async () => {
    const local = createDispatcher(
      contract,
      {
        ...handlers,
        getClaim: () => {
          throw new Error('inner detail');
        },
      },
      { context: { agent: 'agent-9' }, disclosure: 'public' },
    );

    const result = await local.dispatch('getClaim', { params: { zone: 'x' } });

    const error = result._unsafeUnwrapErr();
    expect(error.cause).toBeUndefined();
    expect(JSON.stringify(error)).not.toContain('inner detail');
  });

  it('carries ctx through local dispatch at full disclosure', async () => {
    const local = createDispatcher(
      contract,
      {
        ...handlers,
        getClaim: () =>
          err(
            railError('not_found', 'Missing', {
              ctx: { gate: 'atc', category: 'zone_held' },
            }),
          ),
      },
      { context: { agent: 'agent-9' } },
    );

    const result = await local.dispatch('getClaim', { params: { zone: 'x' } });

    expect(result._unsafeUnwrapErr().ctx).toEqual({
      gate: 'atc',
      category: 'zone_held',
    });
  });
});
