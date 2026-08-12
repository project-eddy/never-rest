import { type } from 'arktype';

import type { ContractDef } from '@eddy-works/never-rest/contract';

export const userSchema = type({
  id: 'string',
  name: 'string',
});

// Path params, query, and body are declared separately for the typed client.
export const usersContract = {
  getUser: {
    method: 'GET',
    path: '/users/:id',
    params: type({ id: 'string' }),
    output: userSchema,
    errors: ['not_found'],
  },
  createUser: {
    method: 'POST',
    path: '/users',
    body: type({ name: 'string>0' }),
    output: userSchema,
    errors: ['conflict'],
  },
  listUsers: {
    method: 'GET',
    path: '/users',
    output: userSchema.array(),
    errors: [],
  },
} as const satisfies ContractDef;
