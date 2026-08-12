import { z } from 'zod';

import type { ContractDef } from '@eddy-works/never-rest/contract';

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});

// Path params, query, and body are declared separately for the typed client.
export const usersContract = {
  getUser: {
    method: 'GET',
    path: '/users/:id',
    params: z.object({ id: z.string() }),
    output: userSchema,
    errors: ['not_found'],
  },
  createUser: {
    method: 'POST',
    path: '/users',
    body: z.object({ name: z.string().min(1) }),
    output: userSchema,
    errors: ['conflict'],
  },
  listUsers: {
    method: 'GET',
    path: '/users',
    output: z.array(userSchema),
    errors: [],
  },
} as const satisfies ContractDef;
