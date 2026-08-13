import { err, ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { ContractDef } from '../contract/types.js';
import { railError } from '../error.js';
import { createTestClient } from './client.js';

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const contract = {
  getUser: {
    method: 'GET' as const,
    path: '/users/:id',
    params: z.object({ id: z.string() }),
    output: userSchema,
    errors: { not_found: 404 },
  },
} satisfies ContractDef;

describe('createTestClient', () => {
  it('returns Ok for a successful handler result', async () => {
    const client = createTestClient(contract, {
      getUser: ({ params }) => ok({ id: params.id, name: 'Ada' }),
    });

    const result = await client.getUser({ params: { id: 'u1' } });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ id: 'u1', name: 'Ada' });
    }
  });

  it('surfaces domain not_found as a typed Err', async () => {
    const client = createTestClient(contract, {
      getUser: () => err(railError('not_found', 'User missing')),
    });

    const result = await client.getUser({ params: { id: 'missing' } });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('not_found');
      expect(result.error.message).toBe('User missing');
    }
  });

  it('distinguishes domain not_found from host route_not_found', async () => {
    const handlers = {
      getUser: () => err(railError('not_found', 'User missing')),
    };

    const client = createTestClient(contract, handlers, { disclosure: 'full' });
    const skewedClient = createTestClient(contract, handlers, {
      disclosure: 'full',
      baseUrl: 'http://never-rest.test/wrong-prefix',
    });

    const domainResult = await client.getUser({ params: { id: 'missing' } });
    const hostResult = await skewedClient.getUser({ params: { id: 'missing' } });

    expect(domainResult.isErr()).toBe(true);
    expect(hostResult.isErr()).toBe(true);
    if (domainResult.isErr() && hostResult.isErr()) {
      expect(domainResult.error.code).toBe('not_found');
      expect(hostResult.error.code).toBe('internal');
      expect(hostResult.error.cause?.code).toBe('route_not_found');
    }
  });

  it('maps output validation failure to internal through serve', async () => {
    const client = createTestClient(
      contract,
      {
        getUser: () => ok({ id: 'u1', name: 42 } as never),
      },
      { disclosure: 'full' },
    );

    const result = await client.getUser({ params: { id: 'u1' } });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('internal');
      expect(result.error.cause?.code).toBe('output_validation_failed');
    }
  });

  it('strips error cause at public disclosure', async () => {
    const publicClient = createTestClient(
      contract,
      {
        getUser: () => ok({ id: 123, name: 'Ada' } as never),
      },
      { disclosure: 'public' },
    );
    const fullClient = createTestClient(
      contract,
      {
        getUser: () => ok({ id: 123, name: 'Ada' } as never),
      },
      { disclosure: 'full' },
    );

    const publicResult = await publicClient.getUser({ params: { id: 'u1' } });
    const fullResult = await fullClient.getUser({ params: { id: 'u1' } });

    expect(publicResult.isErr()).toBe(true);
    expect(fullResult.isErr()).toBe(true);
    if (publicResult.isErr() && fullResult.isErr()) {
      expect(publicResult.error.cause).toBeUndefined();
      expect(fullResult.error.cause?.code).toBe('output_validation_failed');
    }
  });

  it('passes context through to handlers', async () => {
    const client = createTestClient(
      contract,
      {
        getUser: ({ context }) =>
          ok({ id: context.requestId, name: 'Ada' }),
      },
      { context: { requestId: 'ctx-1' } },
    );

    const result = await client.getUser({ params: { id: 'ignored' } });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.id).toBe('ctx-1');
    }
  });

  it('honours basePath on serve and client baseUrl', async () => {
    const mountedContract = {
      getUser: {
        method: 'GET' as const,
        path: '/users/:id',
        params: z.object({ id: z.string() }),
        output: userSchema,
        errors: { not_found: 404 },
      },
    } satisfies ContractDef;

    const client = createTestClient(
      mountedContract,
      {
        getUser: ({ params }) => ok({ id: params.id, name: 'Ada' }),
      },
      { basePath: '/api' },
    );

    const result = await client.getUser({ params: { id: 'u1' } });

    expect(result.isOk()).toBe(true);
  });
});
