import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { ContractDef } from '../contract/types.js';
import { createClient } from './create.js';
import { splitInput } from './request.js';

const userOutput = z.object({ id: z.string(), name: z.string() });
const orderOutput = z.object({ orders: z.array(z.string()) });

const contract = {
  getUser: {
    method: 'GET',
    path: '/users/:id',
    input: z.object({ id: z.string() }),
    output: userOutput,
    errors: ['not_found'],
  },
  loadOrders: {
    method: 'GET',
    path: '/users/:userId/orders',
    input: z.object({ userId: z.string() }),
    output: orderOutput,
    errors: ['not_found'],
  },
  createUser: {
    method: 'POST',
    path: '/users',
    input: z.object({ email: z.string().email() }),
    output: z.object({ id: z.string() }),
    errors: ['conflict'],
  },
  listUsers: {
    method: 'GET',
    path: '/users',
    input: z.object({ limit: z.number().optional() }),
    output: z.object({ users: z.array(userOutput) }),
    errors: [],
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

    const result = await client.getUser({ id: 'u_42' });

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

    const result = await client.getUser({ id: 'missing' });

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

    const result = await client.getUser({ id: 'u_1' });

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

    const result = await client.createUser({ email: 'ada@example.com' });

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

    const result = await client.getUser({ id: 'u_1' });

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

    const result = await client.getUser({ id: 'missing' });

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

    const result = await client.getUser({ id: 'u_1' });

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

    const result = await client.getUser({ id: 'u_1' });

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

    const result = await client.getUser({ id: 'u_1' });

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

    await expect(client.getUser({ id: 'u_1' })).resolves.toBeDefined();
    const result = await client.getUser({ id: 'u_1' });
    expect(result.isErr()).toBe(true);
  });

  it('sends POST remainder as JSON body', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      jsonResponse(201, { id: 'u_new' }),
    );
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    await client.createUser({ email: 'ada@example.com' });

    expect(fetchStub).toHaveBeenCalledWith(
      'https://api.example.com/users',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'ada@example.com' }),
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

    await client.getUser({ id: 'u_1' });

    const [, init] = fetchStub.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('include');
  });

  it('forwards credentials on POST requests after body branch', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      jsonResponse(201, { id: 'u_new' }),
    );
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
      credentials: 'include',
    });

    await client.createUser({ email: 'ada@example.com' });

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

    await client.getUser({ id: 'u_1' });

    const [, init] = fetchStub.mock.calls[0] as [string, RequestInit];
    expect('credentials' in init).toBe(false);
  });

  it('sends GET remainder as query string', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      jsonResponse(200, { users: [] }),
    );
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    await client.listUsers({ limit: 10 });

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
      .getUser({ id: 'missing' })
      .andThen((user) => client.loadOrders({ userId: user.id }));

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
      .getUser({ id: 'u_1' })
      .andThen((user) => client.loadOrders({ userId: user.id }))
      .map((orders) => orders.orders.length);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe(2);
    }
  });
});

describe('client wire fidelity', () => {
  it('accepts client InferInput for a transforming input schema', async () => {
    const transformContract = {
      getScore: {
        method: 'GET',
        path: '/scores/:id',
        input: z.object({ id: z.string(), limit: z.string().transform(Number) }),
        output: z.object({ score: z.number() }),
        errors: [],
      },
    } satisfies ContractDef;

    const fetchStub = vi.fn().mockResolvedValue(jsonResponse(200, { score: 42 }));
    const client = createClient(transformContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.getScore({ id: 's_1', limit: '42' });

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
        input: z.object({ id: z.string(), limit: z.string().transform(Number) }),
        output: z.object({ score: z.number() }),
        errors: [],
      },
    } satisfies ContractDef;

    const fetchStub = vi.fn();
    const client = createClient(transformContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.getScore({ id: 's_1', limit: 42 });

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
        input: z.object({ limit: z.number().default(10) }),
        output: z.object({ items: z.array(z.string()) }),
        errors: [],
      },
    } satisfies ContractDef;

    const fetchStub = vi.fn().mockResolvedValue(jsonResponse(200, { items: [] }));
    const client = createClient(defaultContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    await client.listItems({});

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
        input: z.object({ tags: z.array(z.string()) }),
        output: z.object({ hits: z.number() }),
        errors: [],
      },
    } satisfies ContractDef;

    const fetchStub = vi.fn().mockResolvedValue(jsonResponse(200, { hits: 2 }));
    const client = createClient(tagsContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    await client.search({ tags: ['a', 'b'] });

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
        input: z.object({ tags: z.array(z.string()) }),
        output: z.object({ hits: z.number() }),
        errors: [],
      },
    } satisfies ContractDef;

    const fetchStub = vi.fn().mockResolvedValue(jsonResponse(200, { hits: 1 }));
    const client = createClient(tagsContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    await client.search({ tags: ['a'] });

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
        input: z.object({ tags: z.array(z.string()) }),
        output: z.object({ hits: z.number() }),
        errors: [],
      },
    } satisfies ContractDef;

    const fetchStub = vi.fn();
    const client = createClient(tagsContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.search({ tags: [] });

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
        input: z.object({ filter: z.record(z.string()) }),
        output: z.object({ hits: z.number() }),
        errors: [],
      },
    } satisfies ContractDef;

    const fetchStub = vi.fn();
    const client = createClient(filterContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.search({ filter: { nested: 'x' } });

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
        input: z.object({ id: z.bigint() }),
        output: z.object({ hits: z.number() }),
        errors: [],
      },
    } satisfies ContractDef;

    const fetchStub = vi.fn();
    const client = createClient(bigintContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.search({ id: BigInt(1) });

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
        input: z.object({ since: z.date() }),
        output: z.object({ hits: z.number() }),
        errors: [],
      },
    } satisfies ContractDef;

    const since = new Date('2024-01-15T12:00:00.000Z');
    const fetchStub = vi.fn().mockResolvedValue(jsonResponse(200, { hits: 0 }));
    const client = createClient(dateContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    await client.search({ since });

    const [url] = fetchStub.mock.calls[0] as [string];
    expect(url).toContain('since=2024-01-15T12%3A00%3A00.000Z');
  });

  it('returns validation_error for a missing path parameter before fetch', async () => {
    const fetchStub = vi.fn();
    const client = createClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.getUser({ id: undefined } as { id: string });

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

    const result = await client.getUser({ id: '' });

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

    const result = await client.getUser({ id: 'u_1' });

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

    const result = await client.getUser({ id: 'u_1' });

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

    const result = await client.createUser(body as { email: string });

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
        input: z.object({ amount: z.bigint() }),
        output: z.object({ id: z.string() }),
        errors: [],
      },
    } satisfies ContractDef;

    const fetchStub = vi.fn();
    const client = createClient(bigintPostContract, {
      baseUrl: 'https://api.example.com',
      fetch: fetchStub,
    });

    const result = await client.create({ amount: BigInt(42) });

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
    await client.getUser({ id: 'u_1' });
    await client.getUser({ id: 'u_2' });

    expect(compilePathSpy).not.toHaveBeenCalled();
    compilePathSpy.mockRestore();
  });
});

describe('splitInput', () => {
  it('extracts path params and leaves the remainder for the body', () => {
    expect(splitInput(['id'], { id: 'u_1', email: 'a@b.com' })).toEqual({
      pathParams: { id: 'u_1' },
      remainder: { email: 'a@b.com' },
    });
  });
});
