import { type } from 'arktype';

import type { ContractDef } from '@eddy-works/never-rest/contract';

export const userSchema = type({
  id: 'string',
  name: 'string',
});

// Path params, query, body, and headers are declared separately for the typed client.
export const usersContract = {
  listUsers: {
    method: 'GET',
    path: '/users',
    output: userSchema.array(),
    errors: {},
  },
  ping: {
    method: 'GET',
    path: '/users/ping',
    headers: type({ 'x-request-id': 'string>0' }),
    output: type({ ok: 'true' }),
    errors: {},
  },
  getUser: {
    method: 'GET',
    path: '/users/:id',
    params: type({ id: 'string' }),
    output: userSchema,
    errors: { not_found: 404 },
  },
  createUser: {
    method: 'POST',
    path: '/users',
    body: type({ name: 'string>0' }),
    output: userSchema,
    success: 201,
    errors: { conflict: 409 },
  },
  deleteUser: {
    method: 'DELETE',
    path: '/users/:id',
    params: type({ id: 'string' }),
    success: 204,
    errors: { not_found: 404 },
  },
} as const satisfies ContractDef;
