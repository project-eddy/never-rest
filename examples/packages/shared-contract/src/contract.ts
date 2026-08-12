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

// Protocol surface for `serve`: every domain code on the contract plus host
// codes (`validation_error`, `internal`, `route_not_found`). Missing map
// entries fail construction. `unavailable` is client-only — synthesised on
// network failure by `createClient`, never listed here.
export const statuses = {
  validation_error: 400,
  not_found: 404,
  conflict: 409,
  route_not_found: 404,
  internal: 500,
} as const;
