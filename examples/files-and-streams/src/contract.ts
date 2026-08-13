import { z } from 'zod';

import type { ContractDef } from '@eddy-works/never-rest/contract';

export const assetSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  size: z.number().int().nonnegative(),
});

export const jobSchema = z.object({
  id: z.string(),
  status: z.enum(['running', 'done']),
  progress: z.number().int().min(0).max(100),
});

/**
 * Served JSON contract only. `/uploads` and `/jobs/:id/events` are host
 * paths — they must not appear here or `handle()` will steal them.
 */
export const catalogContract = {
  listAssets: {
    method: 'GET',
    path: '/assets',
    output: z.array(assetSchema),
    errors: {},
  },
  getAsset: {
    method: 'GET',
    path: '/assets/:id',
    params: z.object({ id: z.string() }),
    output: assetSchema,
    errors: { not_found: 404 },
  },
  createJob: {
    method: 'POST',
    path: '/jobs',
    output: jobSchema,
    success: 201,
    errors: {},
  },
  getJob: {
    method: 'GET',
    path: '/jobs/:id',
    params: z.object({ id: z.string() }),
    output: jobSchema,
    errors: { not_found: 404 },
  },
} as const satisfies ContractDef;
