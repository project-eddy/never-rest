import type { ContractDef } from '@eddy-works/never-rest/contract';
import { z } from 'zod';

export const catalogContract = {
  health: {
    method: 'GET',
    path: '/health',
    output: z.object({ ok: z.literal(true) }),
    errors: {},
    summary: 'Liveness check',
  },
  getItem: {
    method: 'GET',
    path: '/items/:id',
    params: z.object({ id: z.string() }),
    output: z.object({ id: z.string(), title: z.string() }),
    errors: { not_found: 404 },
    summary: 'Get an item by id',
  },
} satisfies ContractDef;
