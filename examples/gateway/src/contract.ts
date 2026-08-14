import { z } from 'zod';

import type { ContractDef } from '@eddy-works/never-rest/contract';

export const inventoryContract = {
  reserve: {
    method: 'POST',
    path: '/reserve',
    body: z.object({ sku: z.string(), qty: z.number().int().positive() }),
    output: z.object({ reservationId: z.string() }),
    errors: { not_found: 404 },
  },
} as const satisfies ContractDef;

export const ordersContract = {
  fulfil: {
    method: 'POST',
    path: '/orders/:id/fulfil',
    params: z.object({ id: z.string() }),
    body: z.object({ sku: z.string(), qty: z.number() }),
    output: z.object({ orderId: z.string(), reservationId: z.string() }),
    errors: { fulfilment_failed: 502, not_found: 404 },
  },
} as const satisfies ContractDef;
