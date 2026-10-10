import { z } from 'zod';

import type { ContractDef } from '@eddy-works/never-rest/contract';

export const workContract = {
  runWork: {
    method: 'POST',
    path: '/work',
    body: z.object({ ms: z.number().int().positive() }),
    output: z.object({ done: z.literal(true) }),
    errors: {},
  },
} as const satisfies ContractDef;
