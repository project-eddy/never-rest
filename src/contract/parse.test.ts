import { type } from 'arktype';
import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { z } from 'zod';
import { parseInput, parseOutput } from './parse.js';
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
  input: zodSchema,
  output: zodSchema,
  errors: ['not_found'] as const,
} satisfies RouteDef;

const valibotRoute = {
  method: 'POST',
  path: '/users',
  input: valibotSchema,
  output: valibotSchema,
  errors: ['not_found'] as const,
} satisfies RouteDef;

const arktypeRoute = {
  method: 'POST',
  path: '/users',
  input: arktypeSchema,
  output: arktypeSchema,
  errors: ['not_found'] as const,
} satisfies RouteDef;

const noInputRoute = {
  method: 'GET',
  path: '/health',
  output: zodSchema,
  errors: [] as const,
} satisfies RouteDef;

describe('parseInput', () => {
  it.each([
    ['zod', zodRoute],
    ['valibot', valibotRoute],
    ['arktype', arktypeRoute],
  ] as const)('parses valid input with %s', async (_label, route) => {
    const result = await parseInput(route, validValue);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(validValue);
    }
  });

  it.each([
    ['zod', zodRoute],
    ['valibot', valibotRoute],
    ['arktype', arktypeRoute],
  ] as const)('returns validation_error with issues for malformed input with %s', async (_label, route) => {
    const result = await parseInput(route, invalidValue);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('validation_error');
      expect(result.error.message).toBe('Validation failed');
      expect(result.error.issues).toBeDefined();
      expect(result.error.issues!.length).toBeGreaterThan(0);
      for (const issue of result.error.issues!) {
        expect(issue.message.length).toBeGreaterThan(0);
        expect(Array.isArray(issue.path)).toBe(true);
      }
    }
  });

  it.each([
    ['zod', zodRoute],
    ['valibot', valibotRoute],
    ['arktype', arktypeRoute],
  ] as const)('never throws for invalid input with %s', async (_label, route) => {
    await expect(parseInput(route, invalidValue)).resolves.toBeDefined();
  });

  it('returns undefined for routes without input schema', async () => {
    const result = await parseInput(noInputRoute, { ignored: true });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBeUndefined();
    }
  });
});

const outputTransformSchema = z.object({
  name: z.string(),
  extra: z.string().optional(),
}).transform(({ name }) => ({ name: name.toUpperCase() }));

const outputRoute = {
  method: 'GET',
  path: '/users/:id',
  output: outputTransformSchema,
  errors: ['not_found'] as const,
} satisfies RouteDef;

describe('parseOutput', () => {
  it('returns the parsed and transformed output value', async () => {
    const result = await parseOutput(outputRoute, { name: 'alice', extra: 'ignored' });
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
