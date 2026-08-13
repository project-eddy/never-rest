import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ContractDef } from '../contract/types.js';
import { checkContractOutputs, checkTransportStability } from './transport.js';

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

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const stableContract = {
  getUser: {
    method: 'GET' as const,
    path: '/users/:id',
    output: userSchema,
    errors: { not_found: 404 },
  },
  listUsers: {
    method: 'GET' as const,
    path: '/users',
    output: z.array(userSchema),
    errors: {},
  },
} as const satisfies ContractDef;

describe('checkContractOutputs', () => {
  it('passes when every operation sample is transport-stable', async () => {
    const result = await checkContractOutputs(stableContract, {
      getUser: { id: 'u1', name: 'Ada' },
      listUsers: [{ id: 'u1', name: 'Ada' }],
    });

    expect(result.isOk()).toBe(true);
  });

  it('fails naming the unstable operation', async () => {
    const unstableContract = {
      getUser: {
        method: 'GET' as const,
        path: '/users/:id',
        output: userSchema,
        errors: { not_found: 404 },
      },
      getScore: {
        method: 'GET' as const,
        path: '/score',
        output: z.number().transform(String),
        errors: {},
      },
    } as const satisfies ContractDef;

    const result = await checkContractOutputs(unstableContract, {
      getUser: { id: 'u1', name: 'Ada' },
      getScore: 42,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('transport_unstable');
      expect(result.error.message).toContain('getScore');
    }
  });
});
