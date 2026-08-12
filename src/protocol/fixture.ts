/**
 * Mini contract for protocol-only scenarios (not the shared users contract).
 */
import { z } from 'zod';

import type { ContractDef } from '../contract/types.js';

export const itemSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const protocolContract = {
  getItem: {
    method: 'GET',
    path: '/items/:id',
    params: z.object({ id: z.string() }),
    output: itemSchema,
    errors: ['not_found'],
  },
} as const satisfies ContractDef;

export const protocolStatuses = {
  validation_error: 400,
  not_found: 404,
  route_not_found: 404,
  internal: 500,
} as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
