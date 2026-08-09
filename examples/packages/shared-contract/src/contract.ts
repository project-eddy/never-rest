import { z } from 'zod';

import type { ContractDef } from '@eddy-works/never-rest/contract';

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});

/**
 * Shared demo contract — imported by every framework example.
 * Path `:param` keys belong in `input` so the typed client can build URLs.
 */
export const usersContract = {
  getUser: {
    method: 'GET',
    path: '/users/:id',
    input: z.object({ id: z.string() }),
    output: userSchema,
    errors: ['not_found'],
  },
  createUser: {
    method: 'POST',
    path: '/users',
    input: z.object({ name: z.string().min(1) }),
    output: userSchema,
    errors: ['conflict'],
  },
  listUsers: {
    method: 'GET',
    path: '/users',
    output: z.array(userSchema),
    errors: [],
  },
} satisfies ContractDef;

export const statuses = {
  validation_error: 400,
  not_found: 404,
  conflict: 409,
  unavailable: 503,
  internal: 500,
} as const;
