import { type } from 'arktype';
import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { z } from 'zod';
import { parseOutput, parseRouteSources } from './parse.js';
import type { RouteDef } from './types.js';

const validValue = { name: 'alice', age: 30 };
const invalidValue = { name: '', age: -1 };

const zodSchema = z.object({
  name: z.string().min(1),
  age: z.number().min(0),
});

const valibotSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  age: v.pipe(v.number(), v.minValue(0)),
});

const arktypeSchema = type({
  name: 'string>0',
  age: 'number>=0',
});

const zodRoute = {
  method: 'POST',
  path: '/users',
  body: zodSchema,
  output: zodSchema,
  errors: ['not_found'] as const,
} satisfies RouteDef;

const valibotRoute = {
  method: 'POST',
  path: '/users',
  body: valibotSchema,
  output: valibotSchema,
  errors: ['not_found'] as const,
} satisfies RouteDef;

const arktypeRoute = {
  method: 'POST',
  path: '/users',
  body: arktypeSchema,
  output: arktypeSchema,
  errors: ['not_found'] as const,
} satisfies RouteDef;

const noSourcesRoute = {
  method: 'GET',
  path: '/health',
  output: zodSchema,
  errors: [] as const,
} satisfies RouteDef;

const queryDefaultRoute = {
  method: 'GET',
  path: '/items',
  query: z.object({
    limit: z.string().default('10').transform(Number),
  }),
  output: z.object({ ok: z.boolean() }),
  errors: [] as const,
} satisfies RouteDef;

describe('parseRouteSources', () => {
  it.each([
    ['zod', zodRoute],
    ['valibot', valibotRoute],
    ['arktype', arktypeRoute],
  ] as const)('parses valid body with %s', async (_label, route) => {
    const result = await parseRouteSources(route, { body: validValue });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ body: validValue });
    }
  });

  it.each([
    ['zod', zodRoute],
    ['valibot', valibotRoute],
    ['arktype', arktypeRoute],
  ] as const)(
    'returns validation_error with issues for malformed body with %s',
    async (_label, route) => {
      const result = await parseRouteSources(route, { body: invalidValue });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('validation_error');
        expect(result.error.message).toBe('Validation failed');
        expect(result.error.issues).toBeDefined();
        expect(result.error.issues!.length).toBeGreaterThan(0);
        for (const issue of result.error.issues!) {
          expect(issue.message.length).toBeGreaterThan(0);
          expect(Array.isArray(issue.path)).toBe(true);
          expect(issue.path[0]).toBe('body');
        }
      }
    },
  );

  it.each([
    ['zod', zodRoute],
    ['valibot', valibotRoute],
    ['arktype', arktypeRoute],
  ] as const)('never throws for invalid body with %s', async (_label, route) => {
    await expect(
      parseRouteSources(route, { body: invalidValue }),
    ).resolves.toBeDefined();
  });

  it('returns empty args for routes without input sources', async () => {
    const result = await parseRouteSources(noSourcesRoute, {
      query: { ignored: true },
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({});
    }
  });

  it('returns validation_error when a declared body is missing', async () => {
    const result = await parseRouteSources(zodRoute, {});
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('validation_error');
      expect(result.error.issues).toEqual([
        {
          path: ['body'],
          message: 'Missing required body for this route',
        },
      ]);
    }
  });

  it('applies query defaults on the server side when the key is omitted', async () => {
    const result = await parseRouteSources(queryDefaultRoute, {
      query: {},
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ query: { limit: 10 } });
    }
  });

  it('parses params and body as distinct sources', async () => {
    const route = {
      method: 'PUT',
      path: '/users/:id',
      params: z.object({ id: z.string() }),
      body: z.object({ id: z.string(), name: z.string() }),
      output: z.object({ ok: z.boolean() }),
      errors: [] as const,
    } satisfies RouteDef;

    const result = await parseRouteSources(route, {
      params: { id: 'path-id' },
      body: { id: 'body-id', name: 'Ada' },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        params: { id: 'path-id' },
        body: { id: 'body-id', name: 'Ada' },
      });
    }
  });
});

const outputTransformSchema = z
  .object({
    name: z.string(),
    extra: z.string().optional(),
  })
  .transform(({ name }) => ({ name: name.toUpperCase() }));

const outputRoute = {
  method: 'GET',
  path: '/users/:id',
  params: z.object({ id: z.string() }),
  output: outputTransformSchema,
  errors: ['not_found'] as const,
} satisfies RouteDef;

describe('parseOutput', () => {
  it('returns the parsed and transformed output value', async () => {
    const result = await parseOutput(outputRoute, {
      name: 'alice',
      extra: 'ignored',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ name: 'ALICE' });
    }
  });

  it('returns internal with output_validation_failed cause on failure', async () => {
    const result = await parseOutput(outputRoute, { name: 123 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('internal');
      expect(result.error.message).toBe('An unexpected error occurred');
      expect(result.error.cause?.code).toBe('output_validation_failed');
      expect(result.error.cause?.message).toBe(
        'Handler output violated the route contract',
      );
      expect(result.error.cause?.issues).toBeDefined();
      expect(result.error.cause!.issues!.length).toBeGreaterThan(0);
    }
  });
});
