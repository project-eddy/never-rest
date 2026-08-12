import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { checkTransportStability } from './transport.js';

describe('checkTransportStability', () => {
  it('passes for an ISO-string-to-Date schema', async () => {
    const schema = z.object({
      createdAt: z.string().datetime().transform((value) => new Date(value)),
    });

    const result = await checkTransportStability(schema, {
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
  });

  it('fails for a number-to-string output transform', async () => {
    const schema = z.number().transform(String);

    const result = await checkTransportStability(schema, 42);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('transport_unstable');
    }
  });
});
