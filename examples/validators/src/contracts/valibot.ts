import * as v from 'valibot';

import type { ContractDef } from '@eddy-works/never-rest/contract';

export const userSchema = v.object({
  id: v.string(),
  name: v.string(),
});

// Path params, query, body, and headers are declared separately for the typed client.
export const usersContract = {
  listUsers: {
    method: 'GET',
    path: '/users',
    output: v.array(userSchema),
    errors: {},
  },
  ping: {
    method: 'GET',
    path: '/users/ping',
    headers: v.object({
      'x-request-id': v.pipe(v.string(), v.minLength(1)),
    }),
    output: v.object({ ok: v.literal(true) }),
    errors: {},
  },
  getUser: {
    method: 'GET',
    path: '/users/:id',
    params: v.object({ id: v.string() }),
    output: userSchema,
    errors: { not_found: 404 },
  },
  createUser: {
    method: 'POST',
    path: '/users',
    body: v.object({
      name: v.pipe(v.string(), v.minLength(1)),
    }),
    output: userSchema,
    success: 201,
    errors: { conflict: 409 },
  },
  deleteUser: {
    method: 'DELETE',
    path: '/users/:id',
    params: v.object({ id: v.string() }),
    success: 204,
    errors: { not_found: 404 },
  },
} as const satisfies ContractDef;
