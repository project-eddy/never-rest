import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ContractConfigurationError } from '../contract/compile.js';
import type { ContractDef } from '../contract/types.js';
import { toMcpTools } from './tools.js';

const getItemContract = {
  getItem: {
    method: 'GET',
    path: '/items/:id',
    params: z.object({ id: z.string() }),
    output: z.object({ id: z.string(), title: z.string() }),
    errors: { not_found: 404 },
    summary: 'Get an item by id',
  },
} satisfies ContractDef;

describe('toMcpTools', () => {
  it('projects a GET operation to a read-only tool', () => {
    const tools = toMcpTools(getItemContract);
    const tool = tools[0];

    expect(tool?.name).toBe('getItem');
    expect(tool?.description).toBe('Get an item by id');
    expect(tool?.annotations).toEqual({ readOnlyHint: true });
    expect(tool?.inputSchema.additionalProperties).toBe(false);
  });

  it('refuses an operation with query and body', () => {
    const contract = {
      search: {
        method: 'POST',
        path: '/search',
        query: z.object({ q: z.string() }),
        body: z.object({ limit: z.number() }),
        output: z.object({ hits: z.number() }),
        errors: {},
      },
    } satisfies ContractDef;

    expect(() => toMcpTools(contract)).toThrow(ContractConfigurationError);
  });
});
