import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { mapResponse } from './response.js';

const route = {
  method: 'GET' as const,
  path: '/users/:id',
  output: z.object({ id: z.string() }),
  errors: { not_found: 404 },
};

describe('mapResponse boundary errors', () => {
  it('Classifying an HTML 429 as rate limited', async () => {
    const result = await mapResponse(
      route,
      new Response('<html>slow down</html>', {
        status: 429,
        headers: { 'retry-after': '2', 'content-type': 'text/html' },
      }),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('boundary.rate_limited');
      expect(result.error.retryAfterMs).toBe(2000);
      expect(result.error.message).not.toContain('slow down');
      expect(result.error.ctx).toEqual({ httpStatus: 429 });
    }
  });

  it('classifies an empty 401 as unauthenticated', async () => {
    const result = await mapResponse(route, new Response(null, { status: 401 }));
    expect(result._unsafeUnwrapErr().code).toBe('boundary.unauthenticated');
  });

  it('Wrapping a status and envelope mismatch as internal', async () => {
    const result = await mapResponse(
      route,
      new Response(JSON.stringify({ code: 'not_found', message: 'missing' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(result._unsafeUnwrapErr().code).toBe('internal');
    expect(result._unsafeUnwrapErr().cause?.code).toBe('not_found');
  });

  it('classifies empty 403, 408, 503, and 504 as boundary errors', async () => {
    const cases = [
      [403, 'boundary.forbidden'],
      [408, 'boundary.request_timeout'],
      [503, 'boundary.overloaded'],
      [504, 'boundary.timeout'],
    ] as const;
    for (const [status, code] of cases) {
      const result = await mapResponse(route, new Response(null, { status }));
      expect(result._unsafeUnwrapErr().code).toBe(code);
    }
  });

  it('maps 502 without an envelope to unavailable', async () => {
    const result = await mapResponse(
      route,
      new Response('bad gateway', { status: 502 }),
    );
    expect(result._unsafeUnwrapErr().code).toBe('unavailable');
  });
});
