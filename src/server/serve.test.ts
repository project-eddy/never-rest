import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ContractConfigurationError } from '../contract/compile.js';
import type { ContractDef } from '../contract/types.js';
import { chain, railError } from '../error.js';
import { serve, type Handlers } from './serve.js';

const statuses = {
  validation_error: 400,
  not_found: 404,
  route_not_found: 404,
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

describe('serve construction', () => {
  it('throws ContractConfigurationError when a required status is missing', () => {
    const { conflict: _conflict, ...incomplete } = statuses;
    expect(() =>
      serve(contract, handlers, {
        statuses: incomplete as typeof statuses,
        origin: 'users-api',
      }),
    ).toThrow(ContractConfigurationError);
    expect(() =>
      serve(contract, handlers, {
        statuses: incomplete as typeof statuses,
        origin: 'users-api',
      }),
    ).toThrow('Missing or invalid HTTP status for "conflict"');
  });

  it('throws ContractConfigurationError when a status is out of range', () => {
    expect(() =>
      serve(contract, handlers, {
        statuses: { ...statuses, internal: 200 },
        origin: 'users-api',
      }),
    ).toThrow(ContractConfigurationError);
  });

  it('throws ContractConfigurationError when a route uses a reserved domain code', () => {
    const badContract = {
      getUser: {
        ...contract.getUser,
        errors: ['route_not_found'],
      },
    } satisfies ContractDef;

    expect(() =>
      serve(
        badContract,
        {
          getUser: handlers.getUser,
        },
        { statuses },
      ),
    ).toThrow(ContractConfigurationError);
  });

  it('throws ContractConfigurationError when a handler is missing', () => {
    const { listUsers: _listUsers, ...partialHandlers } = handlers;
    expect(() =>
      serve(contract, partialHandlers as Handlers<typeof contract, TestContext>, {
        statuses,
      }),
    ).toThrow(ContractConfigurationError);
    expect(() =>
      serve(contract, partialHandlers as Handlers<typeof contract, TestContext>, {
        statuses,
      }),
    ).toThrow('Missing handler for operation "listUsers"');
  });
});

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
  ])('returns route_not_found for $label', async ({ request }) => {
    const { response, body } = await call(createHandler(), request);
    expect(response.status).toBe(404);
    expect(body).toEqual({
      code: 'route_not_found',
      message: 'Not found',
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
    });
  });

  it('normalizes undeclared handler errors to internal', async () => {
    const handler = createHandler({
      getUser: () =>
        err(railError('conflict', 'Unexpected clash') as never),
    });
    const { response, body } = await call(
      handler,
      new Request('http://localhost/users/u1'),
    );
    expect(response.status).toBe(500);
    expect(body.code).toBe('internal');
    expect(body.message).toBe('An unexpected error occurred');
    expect(body.cause).toBeUndefined();
  });

  it('preserves undeclared handler cause at full disclosure', async () => {
    const handler = createHandler(
      {
        getUser: () =>
          err(railError('conflict', 'Unexpected clash') as never),
      },
      {
        statuses,
        origin: 'users-api',
        disclosure: 'full',
      },
    );
    const { body } = await call(
      handler,
      new Request('http://localhost/users/u1'),
    );
    expect(body.code).toBe('internal');
    expect(body.cause).toMatchObject({
      code: 'undeclared_handler_error',
      message: 'Handler returned an undeclared error code',
      cause: { code: 'conflict', message: 'Unexpected clash' },
    });
  });

  it('defaults omitted disclosure to public', async () => {
    const handler = createHandler({
      getUser: () =>
        err(railError('conflict', 'Unexpected clash') as never),
    });
    const omitted = await call(
      handler,
      new Request('http://localhost/users/u1'),
    );
    const explicitPublic = await call(
      createHandler(
        {
          getUser: () =>
            err(railError('conflict', 'Unexpected clash') as never),
        },
        { statuses, origin: 'users-api', disclosure: 'public' },
      ),
      new Request('http://localhost/users/u1'),
    );
    expect(omitted.body).toEqual(explicitPublic.body);
    expect(omitted.body.cause).toBeUndefined();
  });

  it('converts thrown exceptions to internal 500 with cause message', async () => {
    const handler = createHandler(
      {
        getUser: () => {
          throw new Error('database exploded');
        },
      },
      { statuses, origin: 'users-api', disclosure: 'full' },
    );
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
    const withoutOrigin = createHandler(
      {
        getUser: () => err(railError('not_found', 'Missing')),
      },
      { statuses, origin: 'users-api', disclosure: 'full' },
    );
    const withOrigin = createHandler(
      {
        getUser: () =>
          err(
            railError('not_found', 'Missing', { origin: 'orders-service' }),
          ),
      },
      { statuses, origin: 'users-api', disclosure: 'full' },
    );

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
    const handler = createHandler(
      {
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
      },
      { statuses, origin: 'users-api', disclosure: 'full' },
    );

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

  it('merges path params into input before validation', async () => {
    const withPathInput = {
      getUser: {
        method: 'GET' as const,
        path: '/users/:id',
        input: z.object({ id: z.string() }),
        output: userSchema,
        errors: ['not_found'],
      },
    } satisfies ContractDef;

    const handler = serve(
      withPathInput,
      {
        getUser: ({ input }) => ok({ id: input.id, name: 'Ada' }),
      },
      { statuses, origin: 'users-api' },
    );

    const response = await handler(
      new Request('http://localhost/users/u1'),
      undefined,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'u1', name: 'Ada' });
  });

  it('wraps forged internal errors with a generic public message', async () => {
    const secret = 'postgres://admin:secret@db.internal';
    const handler = createHandler({
      getUser: () => err(railError('internal', secret) as never),
    });
    const { response, body } = await call(
      handler,
      new Request('http://localhost/users/u1'),
    );
    expect(response.status).toBe(500);
    expect(body).toEqual({
      code: 'internal',
      message: 'An unexpected error occurred',
    });
    expect(JSON.stringify(body)).not.toContain('postgres://');
  });

  it('preserves forged internal detail at full disclosure', async () => {
    const secret = 'postgres://admin:secret@db.internal';
    const handler = createHandler(
      {
        getUser: () => err(railError('internal', secret) as never),
      },
      { statuses, origin: 'users-api', disclosure: 'full' },
    );
    const { body } = await call(
      handler,
      new Request('http://localhost/users/u1'),
    );
    expect(body.code).toBe('internal');
    expect(body.message).toBe('An unexpected error occurred');
    expect(body.cause).toMatchObject({
      code: 'undeclared_handler_error',
      cause: { code: 'internal', message: secret },
    });
  });

  it('still wraps forged validation_error and route_not_found', async () => {
    const validationHandler = createHandler({
      getUser: () => err(railError('validation_error', 'forged') as never),
    });
    const validation = await call(
      validationHandler,
      new Request('http://localhost/users/u1'),
    );
    expect(validation.body).toEqual({
      code: 'internal',
      message: 'An unexpected error occurred',
    });

    const routeHandler = createHandler({
      getUser: () => err(railError('route_not_found', 'forged') as never),
    });
    const route = await call(
      routeHandler,
      new Request('http://localhost/users/u1'),
    );
    expect(route.body).toEqual({
      code: 'internal',
      message: 'An unexpected error occurred',
    });
  });

  it('returns validation_error when request.text() rejects', async () => {
    const handler = createHandler();
    const request = new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    vi.spyOn(request, 'text').mockRejectedValue(new Error('stream aborted'));

    const { response, body } = await call(handler, request);
    expect(response.status).toBe(400);
    expect(body.code).toBe('validation_error');
  });

  it('falls back to public disclosure when the disclosure callback throws', async () => {
    const handler = createHandler(
      {
        getUser: () =>
          err(railError('conflict', 'Unexpected clash') as never),
      },
      {
        statuses,
        origin: 'users-api',
        disclosure: () => {
          throw new Error('disclosure exploded');
        },
      },
    );
    const { response, body } = await call(
      handler,
      new Request('http://localhost/users/u1'),
    );
    expect(response.status).toBe(500);
    expect(body.cause).toBeUndefined();
    expect(body.message).toBe('An unexpected error occurred');
  });

  it('returns a constant internal body when success output cannot be serialised', async () => {
    const circularContract = {
      getCircular: {
        method: 'GET' as const,
        path: '/circular',
        output: z.custom<Record<string, unknown>>(
          (value) => typeof value === 'object' && value !== null,
        ),
        errors: [],
      },
    } satisfies ContractDef;

    const circular: Record<string, unknown> = { id: 'u1' };
    circular.self = circular;

    const handler = serve(
      circularContract,
      {
        getCircular: () => ok(circular),
      },
      { statuses, origin: 'users-api' },
    );

    const response = await handler(
      new Request('http://localhost/circular'),
      { requestId: 'req-1' },
    );
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(500);
    expect(body).toEqual({
      code: 'internal',
      message: 'An unexpected error occurred',
    });
  });

  it('returns a bounded response for cyclic handler error causes', async () => {
    const inner: { cause?: ReturnType<typeof railError> } = railError(
      'internal',
      'leaf',
    );
    const middle = railError('internal', 'middle', {
      cause: inner as ReturnType<typeof railError>,
    });
    inner.cause = middle;

    const handler = createHandler(
      {
        getUser: () => err(railError('not_found', 'Missing', { cause: middle })),
      },
      { statuses, origin: 'users-api', disclosure: 'full' },
    );

    const { response, body } = await call(
      handler,
      new Request('http://localhost/users/u1'),
    );
    expect(response.status).toBe(404);
    expect(body.code).toBe('not_found');
    expect(body.cause).toBeDefined();
  });

  it('returns validation_error for undecodable path captures', async () => {
    const handler = createHandler();
    const { response, body } = await call(
      handler,
      new Request('http://localhost/users/%zz'),
    );
    expect(response.status).toBe(400);
    expect(body.code).toBe('validation_error');
  });

  it('reads repeated k[] query keys back into arrays', async () => {
    const tagsContract = {
      listTags: {
        method: 'GET' as const,
        path: '/tags',
        input: z.object({ tags: z.array(z.string()) }),
        output: z.object({ tags: z.array(z.string()) }),
        errors: [],
      },
    } satisfies ContractDef;

    const handler = serve(
      tagsContract,
      {
        listTags: ({ input }) => ok({ tags: input.tags }),
      },
      { statuses, origin: 'users-api' },
    );

    const response = await handler(
      new Request('http://localhost/tags?tags[]=a&tags[]=b'),
      { requestId: 'req-1' },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tags: ['a', 'b'] });
  });

  it('reads a single k[] query key as a one-element array', async () => {
    const tagsContract = {
      listTags: {
        method: 'GET' as const,
        path: '/tags',
        input: z.object({ tags: z.array(z.string()) }),
        output: z.object({ tags: z.array(z.string()) }),
        errors: [],
      },
    } satisfies ContractDef;

    const handler = serve(
      tagsContract,
      {
        listTags: ({ input }) => ok({ tags: input.tags }),
      },
      { statuses, origin: 'users-api' },
    );

    const response = await handler(
      new Request('http://localhost/tags?tags[]=a'),
      { requestId: 'req-1' },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tags: ['a'] });
  });
});

describe('server output validation', () => {
  it('always validates output through the route schema', async () => {
    const validateSpy = vi.spyOn(userSchema['~standard'], 'validate');
    const handler = createHandler();

    const { response, body } = await call(
      handler,
      new Request('http://localhost/users/u1'),
    );

    expect(response.status).toBe(200);
    expect(body).toEqual({ id: 'u1', name: 'Ada' });
    expect(validateSpy).toHaveBeenCalled();
    validateSpy.mockRestore();
  });

  it('serialises the parsed schema output, stripping undeclared fields', async () => {
    const handler = createHandler({
      getUser: () =>
        ok({
          id: 'u1',
          name: 'Ada',
          extraField: 'stripped',
        }),
    });

    const { response, body } = await call(
      handler,
      new Request('http://localhost/users/u1'),
    );

    expect(response.status).toBe(200);
    expect(body).toEqual({ id: 'u1', name: 'Ada' });
    expect(body).not.toHaveProperty('extraField');
  });

  it('maps output validation failure to internal', async () => {
    const handler = createHandler(
      {
        getUser: () => ok({ id: 'u1', name: 42 } as never),
      },
      { statuses, origin: 'users-api', disclosure: 'full' },
    );

    const { response, body } = await call(
      handler,
      new Request('http://localhost/users/u1'),
    );

    expect(response.status).toBe(500);
    expect(body.code).toBe('internal');
    expect(body.message).toBe('An unexpected error occurred');
    expect(body.origin).toBe('users-api');
    expect(body.cause).toMatchObject({
      code: 'output_validation_failed',
      message: 'Handler output violated the route contract',
      issues: expect.arrayContaining([
        expect.objectContaining({ path: ['name'] }),
      ]),
    });
    expect(body.issues).toBeUndefined();
  });

  it('redacts output validation detail at public disclosure', async () => {
    const handler = createHandler(
      {
        getUser: () => ok({ id: 123, name: 'Ada' } as never),
      },
      {
        statuses,
        origin: 'users-api',
        disclosure: 'public',
      },
    );

    const { response, body } = await call(
      handler,
      new Request('http://localhost/users/u1'),
    );

    expect(response.status).toBe(500);
    expect(body.code).toBe('internal');
    expect(body.cause).toBeUndefined();
    expect(body.issues).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/"id"/);
  });
});
