import { z } from 'zod';

import type { ContractDef } from '@eddy-works/never-rest/contract';

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});

// Path params, query, body, and headers are declared separately for the typed client.
export const usersContract = {
  listUsers: {
    method: 'GET',
    path: '/users',
    output: z.array(userSchema),
    errors: {},
  },
  ping: {
    method: 'GET',
    path: '/users/ping',
    headers: z.object({ 'x-request-id': z.string().min(1) }),
    output: z.object({ ok: z.literal(true) }),
    errors: {},
  },
  getUser: {
    method: 'GET',
    path: '/users/:id',
    params: z.object({ id: z.string() }),
    output: userSchema,
    errors: { not_found: 404 },
  },
  createUser: {
    method: 'POST',
    path: '/users',
    body: z.object({ name: z.string().min(1) }),
    output: userSchema,
    success: 201,
    errors: { conflict: 409 },
  },
  deleteUser: {
    method: 'DELETE',
    path: '/users/:id',
    params: z.object({ id: z.string() }),
    success: 204,
    errors: { not_found: 404 },
  },
} as const satisfies ContractDef;
