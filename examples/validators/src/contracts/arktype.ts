import { type } from 'arktype';

import type { ContractDef } from '@eddy-works/never-rest/contract';

export const userSchema = type({
  id: 'string',
  name: 'string',
});

// Every `:param` in path must also appear in `input` (needed for the typed client).
export const usersContract = {
  getUser: {
    method: 'GET',
    path: '/users/:id',
    input: type({ id: 'string' }),
    output: userSchema,
    errors: ['not_found'],
  },
  createUser: {
    method: 'POST',
    path: '/users',
    input: type({ name: 'string>0' }),
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
