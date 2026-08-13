import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { ContractDef } from '../contract/types.js';
import { createClient } from './create.js';

const userOutput = z.object({ id: z.string(), name: z.string() });
const orderOutput = z.object({ orders: z.array(z.string()) });

const contract = {
  getUser: {
    method: 'GET',
    path: '/users/:id',
    params: z.object({ id: z.string() }),
    output: userOutput,
    errors: { not_found: 404 },
  },
  loadOrders: {
    method: 'GET',
    path: '/users/:userId/orders',
    params: z.object({ userId: z.string() }),
    output: orderOutput,
    errors: { not_found: 404 },
  },
  createUser: {
    method: 'POST',
    path: '/users',
    body: z.object({ email: z.string().email() }),
    output: z.object({ id: z.string() }),
    errors: { conflict: 409 },
  },
  listUsers: {
    method: 'GET',
    path: '/users',
    query: z.object({ limit: z.number().optional() }),
    output: z.object({ users: z.array(userOutput) }),
    errors: {},
  },
} satisfies ContractDef;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createClient', () => {
  it('maps a 2xx JSON body to Ok', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      jsonResponse(200, { id: 'u_42', name: 'Ada' }),
    );
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.getUser({ params: { id: 'u_42' } });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ id: 'u_42', name: 'Ada' });
    }
    expect(fetchStub).toHaveBeenCalledWith(
      'https://api.example.com/users/u_42',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('maps a declared JSON error to Err', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      jsonResponse(404, { code: 'not_found', message: 'User missing' }),
    );
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.getUser({ params: { id: 'missing' } });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('not_found');
      expect(result.error.message).toBe('User missing');
    }
  });

  it('maps an undeclared error code to internal Err with remote cause', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      jsonResponse(500, {
        code: 'database_corrupt',
        message: 'WAL segment missing',
      }),
    );
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.getUser({ params: { id: 'u_1' } });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('internal');
      expect(result.error.message).toBe('Unexpected error response');
      expect(result.error.cause?.code).toBe('database_corrupt');
      expect(result.error.cause?.message).toBe('WAL segment missing');
    }
  });

  it('maps a validation_error envelope to Err', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        code: 'validation_error',
        message: 'Validation failed',
        issues: [{ path: ['email'], message: 'Invalid email' }],
      }),
    );
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.createUser({
      body: { email: 'ada@example.com' },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('validation_error');
      expect(result.error.issues).toEqual([
        { path: ['email'], message: 'Invalid email' },
      ]);
    }
    expect(fetchStub).toHaveBeenCalledOnce();
  });

  it('maps a malformed error envelope to internal Err', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      jsonResponse(400, { code: 'not_found', message: 123 }),
    );
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.getUser({ params: { id: 'u_1' } });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('internal');
      expect(result.error.message).toBe('Unexpected error response');
    }
  });

  it('preserves a bounded nested cause on a declared error', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      jsonResponse(404, {
        code: 'not_found',
        message: 'User missing',
        cause: {
          code: 'lookup_failed',
          message: 'Index miss',
          origin: 'user-store',
        },
      }),
    );
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.getUser({ params: { id: 'missing' } });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('not_found');
      expect(result.error.cause?.code).toBe('lookup_failed');
      expect(result.error.cause?.origin).toBe('user-store');
    }
  });

  it('maps an error envelope exceeding cause depth to internal Err', async () => {
    function nestCause(
      depth: number,
      inner: Record<string, unknown>,
    ): Record<string, unknown> {
      if (depth === 0) {
        return inner;
      }
      return {
        code: 'wrapper',
        message: 'wrapped',
        cause: nestCause(depth - 1, inner),
      };
    }

    const fetchStub = vi.fn().mockResolvedValue(
      jsonResponse(500, nestCause(17, { code: 'database_corrupt', message: 'deep' })),
    );
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.getUser({ params: { id: 'u_1' } });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('internal');
      expect(result.error.message).toBe('Unexpected error response');
    }
  });

  it('maps an unparseable response body to internal Err', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      new Response('not json', { status: 200 }),
    );
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.getUser({ params: { id: 'u_1' } });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('internal');
    }
  });

  it('maps a network failure to a retryable unavailable Err', async () => {
    const fetchStub = vi
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch'));
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.getUser({ params: { id: 'u_1' } });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.retryable).toBe(true);
    }
  });

  it('returns Err instead of throwing on synchronous fetch failure', async () => {
    const fetchStub = vi.fn().mockImplementation(() => {
      throw new Error('sync boom');
    });
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    await expect(
      client.getUser({ params: { id: 'u_1' } }),
    ).resolves.toBeDefined();
    const result = await client.getUser({ params: { id: 'u_1' } });
    expect(result.isErr()).toBe(true);
  });

  it('sends POST body as JSON', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      jsonResponse(200, { id: 'u_new' }),
    );
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    await client.createUser({ body: { email: 'ada@example.com' } });

    expect(fetchStub).toHaveBeenCalledWith(
      'https://api.example.com/users',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'ada@example.com' }),
      }),
    );
  });

  it('sends POST query alongside body', async () => {
    const postQueryContract = {
      createUser: {
        method: 'POST',
        path: '/users',
        query: z.object({ force: z.boolean() }),
        body: z.object({ name: z.string() }),
        output: z.object({ id: z.string() }),
        errors: { conflict: 409 },
      },
    } satisfies ContractDef;

    const fetchStub = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'u_1' }));
    const client = createClient(postQueryContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    await client.createUser({
      query: { force: true },
      body: { name: 'Ada' },
    });

    expect(fetchStub).toHaveBeenCalledWith(
      'https://api.example.com/users?force=true',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Ada' }),
      }),
    );
  });

  it('forwards credentials on GET requests', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      jsonResponse(200, { id: 'u_1', name: 'Ada' }),
    );
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
      credentials: 'include',
    });

    await client.getUser({ params: { id: 'u_1' } });

    const [, init] = fetchStub.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('include');
  });

  it('forwards credentials on POST requests after body branch', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      jsonResponse(200, { id: 'u_new' }),
    );
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
      credentials: 'include',
    });

    await client.createUser({ body: { email: 'ada@example.com' } });

    const [, init] = fetchStub.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('include');
    expect(init.body).toBe(JSON.stringify({ email: 'ada@example.com' }));
  });

  it('omits credentials when ClientOptions.credentials is unset', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      jsonResponse(200, { id: 'u_1', name: 'Ada' }),
    );
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    await client.getUser({ params: { id: 'u_1' } });

    const [, init] = fetchStub.mock.calls[0] as [string, RequestInit];
    expect('credentials' in init).toBe(false);
  });

  it('sends GET query as query string', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      jsonResponse(200, { users: [] }),
    );
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    await client.listUsers({ query: { limit: 10 } });

    expect(fetchStub).toHaveBeenCalledWith(
      'https://api.example.com/users?limit=10',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('short-circuits a composed chain when the first call fails', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      jsonResponse(404, { code: 'not_found', message: 'User missing' }),
    );
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });
    const loadOrdersSpy = vi.spyOn(client, 'loadOrders');

    const result = await client
      .getUser({ params: { id: 'missing' } })
      .andThen((user) =>
        client.loadOrders({ params: { userId: user.id } }),
      );

    expect(result.isErr()).toBe(true);
    expect(loadOrdersSpy).not.toHaveBeenCalled();
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it('composes successful calls with andThen and map', async () => {
    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: 'u_1', name: 'Ada' }))
      .mockResolvedValueOnce(jsonResponse(200, { orders: ['o_1', 'o_2'] }));
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client
      .getUser({ params: { id: 'u_1' } })
      .andThen((user) =>
        client.loadOrders({ params: { userId: user.id } }),
      )
      .map((orders) => orders.orders.length);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe(2);
    }
  });
});

describe('client wire fidelity', () => {
  it('accepts client InferInput for a transforming query schema', async () => {
    const transformContract = {
      getScore: {
        method: 'GET',
        path: '/scores/:id',
        params: z.object({ id: z.string() }),
        query: z.object({ limit: z.string().transform(Number) }),
        output: z.object({ score: z.number() }),
        errors: {},
      },
    } satisfies ContractDef;

    const fetchStub = vi.fn().mockResolvedValue(jsonResponse(200, { score: 42 }));
    const client = createClient(transformContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.getScore({
      params: { id: 's_1' },
      query: { limit: '42' },
    });

    expect(result.isOk()).toBe(true);
    expect(fetchStub).toHaveBeenCalledWith(
      'https://api.example.com/scores/s_1?limit=42',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('rejects handler InferOutput shape before fetch for a transforming schema', async () => {
    const transformContract = {
      getScore: {
        method: 'GET',
        path: '/scores/:id',
        params: z.object({ id: z.string() }),
        query: z.object({ limit: z.string().transform(Number) }),
        output: z.object({ score: z.number() }),
        errors: {},
      },
    } satisfies ContractDef;

    const fetchStub = vi.fn();
    const client = createClient(transformContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.getScore({
      params: { id: 's_1' },
      query: { limit: 42 as unknown as string },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('validation_error');
    }
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('omits a defaulted query field instead of sending the default value', async () => {
    const defaultContract = {
      listItems: {
        method: 'GET',
        path: '/items',
        query: z.object({ limit: z.number().default(10) }),
        output: z.object({ items: z.array(z.string()) }),
        errors: {},
      },
    } satisfies ContractDef;

    const fetchStub = vi.fn().mockResolvedValue(jsonResponse(200, { items: [] }));
    const client = createClient(defaultContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    await client.listItems({ query: {} });

    expect(fetchStub).toHaveBeenCalledWith(
      'https://api.example.com/items',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('serializes array query params with a bracket suffix', async () => {
    const tagsContract = {
      search: {
        method: 'GET',
        path: '/search',
        query: z.object({ tags: z.array(z.string()) }),
        output: z.object({ hits: z.number() }),
        errors: {},
      },
    } satisfies ContractDef;

    const fetchStub = vi.fn().mockResolvedValue(jsonResponse(200, { hits: 2 }));
    const client = createClient(tagsContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    await client.search({ query: { tags: ['a', 'b'] } });

    expect(fetchStub).toHaveBeenCalledWith(
      'https://api.example.com/search?tags%5B%5D=a&tags%5B%5D=b',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('serializes a single-element array with a bracket suffix', async () => {
    const tagsContract = {
      search: {
        method: 'GET',
        path: '/search',
        query: z.object({ tags: z.array(z.string()) }),
        output: z.object({ hits: z.number() }),
        errors: {},
      },
    } satisfies ContractDef;

    const fetchStub = vi.fn().mockResolvedValue(jsonResponse(200, { hits: 1 }));
    const client = createClient(tagsContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    await client.search({ query: { tags: ['a'] } });

    expect(fetchStub).toHaveBeenCalledWith(
      'https://api.example.com/search?tags%5B%5D=a',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('returns validation_error for an empty array query param before fetch', async () => {
    const tagsContract = {
      search: {
        method: 'GET',
        path: '/search',
        query: z.object({ tags: z.array(z.string()) }),
        output: z.object({ hits: z.number() }),
        errors: {},
      },
    } satisfies ContractDef;

    const fetchStub = vi.fn();
    const client = createClient(tagsContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.search({ query: { tags: [] } });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('validation_error');
    }
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('returns validation_error for nested object query values before fetch', async () => {
    const filterContract = {
      search: {
        method: 'GET',
        path: '/search',
        query: z.object({ filter: z.record(z.string(), z.string()) }),
        output: z.object({ hits: z.number() }),
        errors: {},
      },
    } satisfies ContractDef;

    const fetchStub = vi.fn();
    const client = createClient(filterContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.search({ query: { filter: { nested: 'x' } } });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('validation_error');
    }
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('returns validation_error for bigint query values before fetch', async () => {
    const bigintContract = {
      search: {
        method: 'GET',
        path: '/search',
        query: z.object({ id: z.bigint() }),
        output: z.object({ hits: z.number() }),
        errors: {},
      },
    } satisfies ContractDef;

    const fetchStub = vi.fn();
    const client = createClient(bigintContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.search({ query: { id: BigInt(1) } });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('validation_error');
    }
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('serializes Date query params as ISO 8601 scalars', async () => {
    const dateContract = {
      search: {
        method: 'GET',
        path: '/search',
        query: z.object({ since: z.date() }),
        output: z.object({ hits: z.number() }),
        errors: {},
      },
    } satisfies ContractDef;

    const since = new Date('2024-01-15T12:00:00.000Z');
    const fetchStub = vi.fn().mockResolvedValue(jsonResponse(200, { hits: 0 }));
    const client = createClient(dateContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    await client.search({ query: { since } });

    const [url] = fetchStub.mock.calls[0] as [string];
    expect(url).toContain('since=2024-01-15T12%3A00%3A00.000Z');
  });

  it('returns validation_error for a missing path parameter before fetch', async () => {
    const fetchStub = vi.fn();
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.getUser({
      params: { id: undefined } as { id: string },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('validation_error');
      expect(result.error.message).toContain('id');
    }
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('returns validation_error for an empty path parameter before fetch', async () => {
    const fetchStub = vi.fn();
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.getUser({ params: { id: '' } });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('validation_error');
      expect(result.error.message).toContain('id');
    }
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('returns internal Err when a headers callback throws synchronously', async () => {
    const fetchStub = vi.fn();
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
      headers: () => {
        throw new Error('sync header boom');
      },
    });

    const result = await client.getUser({ params: { id: 'u_1' } });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('internal');
    }
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('returns internal Err for an invalid header value on GET', async () => {
    const fetchStub = vi.fn();
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
      headers: { 'x-bad': 'line\nbreak' },
    });

    const result = await client.getUser({ params: { id: 'u_1' } });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('internal');
    }
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('returns internal Err for a circular POST body without throwing', async () => {
    const fetchStub = vi.fn();
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });
    const body: Record<string, unknown> = { email: 'ada@example.com' };
    body.self = body;

    const result = await client.createUser({
      body: body as { email: string },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('internal');
    }
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('returns internal Err for bigint POST bodies without throwing', async () => {
    const bigintPostContract = {
      create: {
        method: 'POST',
        path: '/records',
        body: z.object({ amount: z.bigint() }),
        output: z.object({ id: z.string() }),
        errors: {},
      },
    } satisfies ContractDef;

    const fetchStub = vi.fn();
    const client = createClient(bigintPostContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.create({ body: { amount: BigInt(42) } });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('internal');
    }
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('does not call compilePath on each request', async () => {
    const pathModule = await import('../contract/path.js');
    const compilePathSpy = vi.spyOn(pathModule, 'compilePath');

    const fetchStub = vi.fn().mockResolvedValue(
      jsonResponse(200, { id: 'u_1', name: 'Ada' }),
    );
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    compilePathSpy.mockClear();
    await client.getUser({ params: { id: 'u_1' } });
    await client.getUser({ params: { id: 'u_2' } });

    expect(compilePathSpy).not.toHaveBeenCalled();
    compilePathSpy.mockRestore();
  });
});

describe('client success status and headers', () => {
  it('accepts only the declared success status for Ok', async () => {
    const createdContract = {
      createUser: {
        method: 'POST',
        path: '/users',
        body: z.object({ email: z.string().email() }),
        output: z.object({ id: z.string() }),
        success: 201,
        errors: { conflict: 409 },
      },
    } satisfies ContractDef;

    const fetchStub = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'u_new' }));
    const client = createClient(createdContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.createUser({ body: { email: 'ada@example.com' } });

    expect(result.isOk()).toBe(true);
  });

  it('maps a different 2xx status to validation_error before trusting the body', async () => {
    const createdContract = {
      createUser: {
        method: 'POST',
        path: '/users',
        body: z.object({ email: z.string().email() }),
        output: z.object({ id: z.string() }),
        success: 201,
        errors: { conflict: 409 },
      },
    } satisfies ContractDef;

    const fetchStub = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'u_new' }));
    const client = createClient(createdContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.createUser({ body: { email: 'ada@example.com' } });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('validation_error');
      expect(result.error.message).toContain('expected 201');
    }
  });

  it('resolves 204 routes to Ok without reading the response body', async () => {
    const deleteContract = {
      deleteUser: {
        method: 'DELETE',
        path: '/users/:id',
        params: z.object({ id: z.string() }),
        success: 204,
        errors: { not_found: 404 },
      },
    } satisfies ContractDef;

    const textSpy = vi.spyOn(Response.prototype, 'text');
    const fetchStub = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = createClient(deleteContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.deleteUser({ params: { id: 'u_1' } });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBeUndefined();
    }
    expect(textSpy).not.toHaveBeenCalled();
    textSpy.mockRestore();
  });

  it('sends merged request headers on the wire', async () => {
    const traceContract = {
      trace: {
        method: 'GET',
        path: '/trace',
        headers: z.object({ 'x-request-id': z.string().min(1) }),
        output: z.object({ ok: z.boolean() }),
        errors: {},
      },
    } satisfies ContractDef;

    const fetchStub = vi.fn(async (_url, init) => {
      const request = new Request('https://api.example.com/trace', init);
      expect(request.headers.get('x-request-id')).toBe('req-42');
      expect(request.headers.get('authorization')).toBe('Bearer global');
      return jsonResponse(200, { ok: true });
    });
    const client = createClient(traceContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
      headers: { authorization: 'Bearer global' },
    });

    const result = await client.trace({ headers: { 'x-request-id': 'req-42' } });

    expect(result.isOk()).toBe(true);
    expect(fetchStub).toHaveBeenCalledOnce();
  });

  it('lets per-call headers override global headers for the same key', async () => {
    const traceContract = {
      trace: {
        method: 'GET',
        path: '/trace',
        headers: z.object({ 'x-request-id': z.string() }),
        output: z.object({ ok: z.boolean() }),
        errors: {},
      },
    } satisfies ContractDef;

    const fetchStub = vi.fn(async (_url, init) => {
      const request = new Request('https://api.example.com/trace', init);
      expect(request.headers.get('x-request-id')).toBe('call-wins');
      return jsonResponse(200, { ok: true });
    });
    const client = createClient(traceContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
      headers: { 'x-request-id': 'global' },
    });

    await client.trace({ headers: { 'x-request-id': 'call-wins' } });

    expect(fetchStub).toHaveBeenCalledOnce();
  });
});
