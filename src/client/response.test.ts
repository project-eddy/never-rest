import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { railError } from '../error.js';
import { mapResponse, parseRailErrorEnvelope } from './response.js';

describe('parseRailErrorEnvelope', () => {
  it('carries ctx through a JSON envelope', () => {
    const parsed = parseRailErrorEnvelope({
      code: 'not_found',
      message: 'missing',
      ctx: { gate: 'atc', category: 'zone_held' },
    });
    expect(parsed?.ctx).toEqual({ gate: 'atc', category: 'zone_held' });
  });

  it('rejects a non-object ctx', () => {
    expect(
      parseRailErrorEnvelope({
        code: 'not_found',
        message: 'missing',
        ctx: 'nope',
      }),
    ).toBeUndefined();
  });

  it('round-trips named fields', () => {
    const error = railError('not_found', 'missing', {
      origin: 'users',
      retryable: true,
      nextStep: 'Check the id',
      issues: [{ path: ['id'], message: 'unknown' }],
    });
    const parsed = parseRailErrorEnvelope(JSON.parse(JSON.stringify(error)));
    expect(parsed).toEqual(error);
  });
});

describe('mapResponse', () => {
  const route = {
    method: 'GET' as const,
    path: '/users/:id',
    output: z.object({ id: z.string(), nested: z.object({ n: z.number() }) }),
    errors: { not_found: 404 },
  };

  it('maps schema path issues on a 200 body', async () => {
    const result = await mapResponse(
      route,
      new Response(JSON.stringify({ id: 1, nested: { n: 'x' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('internal');
      expect(result.error.message).toContain('Response validation failed');
    }
  });
});
