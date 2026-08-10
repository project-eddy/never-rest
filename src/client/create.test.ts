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
    errors: ['validation_error', 'conflict'],
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

  it('maps an undeclared error code to internal Err', async () => {
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
      expect(result.error.code).not.toBe('database_corrupt');
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

describe('splitInput', () => {
  it('extracts path params and leaves the remainder for the body', () => {
    expect(splitInput(['id'], { id: 'u_1', email: 'a@b.com' })).toEqual({
      pathParams: { id: 'u_1' },
      remainder: { email: 'a@b.com' },
    });
  });
});
