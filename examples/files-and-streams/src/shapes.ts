import { z } from 'zod';

import type { RouteDef } from '@eddy-works/never-rest/contract';

import { assetSchema } from './contract.js';

/**
 * Shadow route — used with `parseRouteSources` / `parseOutput` / `respond`.
 * Never passed to `serve` or `createClient`.
 */
export const uploadMeta = {
  method: 'POST',
  path: '/uploads',
  body: z.object({ title: z.string().min(1) }),
  output: assetSchema,
  success: 201,
  errors: {},
} as const satisfies RouteDef;

/**
 * Gate for SSE: params only. Event payloads use `eventSchema` + `parseSchema`,
 * not `RouteDef.output` (that field means the HTTP success body).
 */
export const jobEventsGate = {
  method: 'GET',
  path: '/jobs/:id/events',
  params: z.object({ id: z.string().min(1) }),
  errors: { not_found: 404 },
} as const satisfies RouteDef;

export const eventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('progress'),
    progress: z.number().int().min(0).max(100),
  }),
  z.object({ type: z.literal('done') }),
]);
