import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { ContractDef } from '../contract/types.js';
import { createClient } from '../client/create.js';
import { createMutationOptions, createQueryOptions, queryKeyFor } from './options.js';
import { isRetryable } from './retry.js';

const contract = {
  getUser: {
    method: 'GET',
    path: '/users/:id',
    params: z.object({ id: z.string() }),
    output: z.object({ id: z.string(), name: z.string() }),
    errors: { not_found: 404 },
  },
  listUsers: {
    method: 'GET',
    path: '/users',
    output: z.object({ users: z.array(z.object({ id: z.string() })) }),
    errors: {},
  },
  createUser: {
    method: 'POST',
    path: '/users',
    body: z.object({ email: z.string().email() }),
    output: z.object({ id: z.string() }),
    errors: { conflict: 409 },
  },
} satisfies ContractDef;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('queryKeyFor', () => {
  it('includes operation name and args', () => {
    const args = { params: { id: 'u_1' } };
    expect(queryKeyFor('getUser', args)).toEqual(['never-rest', 'getUser', args]);
  });

  it('uses an empty object when args are omitted', () => {
    expect(queryKeyFor('listUsers')).toEqual(['never-rest', 'listUsers', {}]);
  });
});

describe('createQueryOptions', () => {
  it('queryFn resolves with Ok on success', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      jsonResponse(200, { id: 'u_42', name: 'Ada' }),
    );
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });
    const queries = createQueryOptions(client);
    const { queryFn } = queries.getUser({ params: { id: 'u_42' } });

    const result = await queryFn();

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ id: 'u_42', name: 'Ada' });
    }
  });

  it('queryFn resolves with Err on a domain failure instead of rejecting', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      jsonResponse(404, { code: 'not_found', message: 'User missing' }),
    );
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });
    const queries = createQueryOptions(client);
    const { queryFn } = queries.getUser({ params: { id: 'missing' } });

    const settled = queryFn();
    await expect(settled).resolves.toBeDefined();

    const result = await settled;
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('not_found');
    }
  });

  it('queryFn resolves rather than rejecting on network failure', async () => {
    const fetchStub = vi.fn().mockRejectedValue(new Error('network down'));
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });
    const queries = createQueryOptions(client);
    const { queryFn } = queries.getUser({ params: { id: 'u_1' } });

    const result = await queryFn();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('unavailable');
    }
  });
});

describe('createMutationOptions', () => {
  it('mutationFn resolves with Ok on success', async () => {
    const fetchStub = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'u_new' }));
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });
    const mutations = createMutationOptions(client);
    const { mutationFn } = mutations.createUser();

    const result = await mutationFn({ body: { email: 'ada@example.com' } });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ id: 'u_new' });
    }
  });

  it('mutationFn resolves with Err on a domain failure instead of rejecting', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      jsonResponse(409, { code: 'conflict', message: 'Email taken' }),
    );
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });
    const mutations = createMutationOptions(client);
    const { mutationFn } = mutations.createUser();

    const result = await mutationFn({ body: { email: 'taken@example.com' } });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('conflict');
    }
  });
});

describe('isRetryable', () => {
  it('retries unavailable and internal errors', () => {
    expect(isRetryable({ code: 'unavailable', message: 'down' })).toBe(true);
    expect(isRetryable({ code: 'internal', message: 'oops' })).toBe(true);
  });

  it('does not retry domain or validation errors', () => {
    expect(isRetryable({ code: 'not_found', message: 'missing' })).toBe(false);
    expect(isRetryable({ code: 'validation_error', message: 'bad input' })).toBe(false);
    expect(isRetryable({ code: 'conflict', message: 'taken' })).toBe(false);
  });
});
