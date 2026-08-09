import { err, ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { chain, railError } from '../error.js';
import type { ContractDef } from '../contract/types.js';
import { serve, type Handlers } from './serve.js';

const statuses = {
  validation_error: 400,
  not_found: 404,
  conflict: 409,
  internal: 500,
} as const;

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const createInputSchema = z.object({
  name: z.string().min(1),
});

const contract = {
  getUser: {
    method: 'GET',
    path: '/users/:id',
    output: userSchema,
    errors: ['not_found'],
  },
  createUser: {
    method: 'POST',
    path: '/users',
    input: createInputSchema,
    output: userSchema,
    errors: ['conflict'],
  },
  listUsers: {
    method: 'GET',
    path: '/users',
    output: z.array(userSchema),
    errors: [],
  },
} satisfies ContractDef;

type TestContext = { requestId: string };

const handlers: Handlers<typeof contract, TestContext> = {
  getUser: ({ params }) => ok({ id: params.id, name: 'Ada' }),
  createUser: ({ input }) => ok({ id: 'new', name: input.name }),
  listUsers: () => ok([{ id: '1', name: 'Ada' }]),
};

function createHandler(
  overrides: Partial<Handlers<typeof contract, TestContext>> = {},
  serveOptions: Parameters<typeof serve<typeof contract, TestContext>>[2] = {
    statuses,
    origin: 'users-api',
  },
) {
  return serve(contract, { ...handlers, ...overrides }, serveOptions);
}

async function call(
  handler: ReturnType<typeof createHandler>,
  request: Request,
  context: TestContext = { requestId: 'req-1' },
) {
  const response = await handler(request, context);
  const body = (await response.json()) as Record<string, unknown>;
  return { response, body };
}

describe('serve', () => {
  it.each([
    {
      label: 'GET with path params',
      request: new Request('http://localhost/users/u1'),
      expectedStatus: 200,
      assertBody: (body: Record<string, unknown>) => {
        expect(body).toEqual({ id: 'u1', name: 'Ada' });
      },
    },
    {
      label: 'POST with JSON body',
      request: new Request('http://localhost/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Grace' }),
      }),
      expectedStatus: 200,
      assertBody: (body: Record<string, unknown>) => {
        expect(body).toEqual({ id: 'new', name: 'Grace' });
      },
    },
    {
      label: 'GET list route',
      request: new Request('http://localhost/users'),
      expectedStatus: 200,
      assertBody: (body: Record<string, unknown>) => {
        expect(body).toEqual([{ id: '1', name: 'Ada' }]);
      },
    },
  ])('$label', async ({ request, expectedStatus, assertBody }) => {
    const { response, body } = await call(createHandler(), request);
    expect(response.status).toBe(expectedStatus);
    expect(response.headers.get('content-type')).toBe('application/json');
    assertBody(body);
  });

  it.each([
    {
      label: 'wrong method',
      request: new Request('http://localhost/users/u1', { method: 'DELETE' }),
    },
    {
      label: 'unknown path',
      request: new Request('http://localhost/missing'),
    },
  ])('returns 404 RailError for $label', async ({ request }) => {
    const { response, body } = await call(createHandler(), request);
    expect(response.status).toBe(404);
    expect(body).toEqual({
      code: 'not_found',
      message: 'Not found',
      origin: 'users-api',
    });
  });

  it('returns validation_error for malformed JSON body', async () => {
    const request = new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    });
    const { response, body } = await call(createHandler(), request);
    expect(response.status).toBe(400);
    expect(body.code).toBe('validation_error');
    expect(body.origin).toBe('users-api');
  });

  it('returns validation_error for schema validation failure', async () => {
    const request = new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });
    const { response, body } = await call(createHandler(), request);
    expect(response.status).toBe(400);
    expect(body.code).toBe('validation_error');
    expect(body.issues).toBeDefined();
  });

  it('maps declared handler errors to their HTTP status', async () => {
    const handler = createHandler({
      createUser: () => err(railError('conflict', 'Name taken')),
    });
    const request = new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ada' }),
    });
    const { response, body } = await call(handler, request);
    expect(response.status).toBe(409);
    expect(body).toEqual({
      code: 'conflict',
      message: 'Name taken',
      origin: 'users-api',
    });
  });

  it('degrades undeclared handler errors to 500', async () => {
    const handler = createHandler({
      getUser: () =>
        err(railError('conflict', 'Unexpected clash') as never),
    });
    const { response, body } = await call(
      handler,
      new Request('http://localhost/users/u1'),
    );
    expect(response.status).toBe(500);
    expect(body.code).toBe('conflict');
    expect(body.origin).toBe('users-api');
  });

  it('converts thrown exceptions to internal 500 with cause message', async () => {
    const handler = createHandler({
      getUser: () => {
        throw new Error('database exploded');
      },
    });
    const { response, body } = await call(
      handler,
      new Request('http://localhost/users/u1'),
    );
    expect(response.status).toBe(500);
    expect(body.code).toBe('internal');
    expect(body.message).toBe('An unexpected error occurred');
    expect(body).toMatchObject({
      cause: { code: 'internal', message: 'database exploded' },
      origin: 'users-api',
    });
    expect(JSON.stringify(body)).not.toContain('stack');
  });

  it('stamps origin when absent but preserves an existing origin', async () => {
    const withoutOrigin = createHandler({
      getUser: () => err(railError('not_found', 'Missing')),
    });
    const withOrigin = createHandler({
      getUser: () =>
        err(
          railError('not_found', 'Missing', { origin: 'orders-service' }),
        ),
    });

    const missing = await call(
      withoutOrigin,
      new Request('http://localhost/users/u1'),
    );
    expect(missing.body.origin).toBe('users-api');

    const preserved = await call(
      withOrigin,
      new Request('http://localhost/users/u1'),
    );
    expect(preserved.body.origin).toBe('orders-service');
  });

  it('resolves disclosure per request', async () => {
    const handler = createHandler(
      {
        getUser: () => {
          const cause = railError('internal', 'SECRET_CAUSE_DETAIL');
          const error = chain(
            { code: 'not_found', message: 'Missing user' },
            cause,
          );
          return err(error);
        },
      },
      {
        statuses,
        origin: 'users-api',
        disclosure: (request) =>
          request.headers.get('x-internal') === '1' ? 'full' : 'public',
      },
    );

    const publicResponse = await call(
      handler,
      new Request('http://localhost/users/u1'),
    );
    expect(publicResponse.body.cause).toBeUndefined();
    expect(JSON.stringify(publicResponse.body)).not.toContain(
      'SECRET_CAUSE_DETAIL',
    );

    const internalResponse = await call(
      handler,
      new Request('http://localhost/users/u1', {
        headers: { 'x-internal': '1' },
      }),
    );
    expect(internalResponse.body.cause).toMatchObject({
      code: 'internal',
      message: 'SECRET_CAUSE_DETAIL',
    });
  });

  it('returns a two-deep cause chain for chained downstream failures', async () => {
    const downstreamError = railError('internal', 'pool exhausted', {
      origin: 'inventory-api',
    });
    const handler = createHandler({
      getUser: () =>
        err(
          chain(
            {
              code: 'not_found',
              message: 'User unavailable',
            },
            downstreamError,
          ),
        ),
    });

    const { body } = await call(
      handler,
      new Request('http://localhost/users/u1'),
    );

    expect(body).toMatchObject({
      code: 'not_found',
      message: 'User unavailable',
      origin: 'users-api',
      cause: {
        code: 'internal',
        message: 'pool exhausted',
        origin: 'inventory-api',
      },
    });
  });
});
