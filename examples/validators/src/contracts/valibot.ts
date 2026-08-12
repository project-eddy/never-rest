import * as v from 'valibot';

import type { ContractDef } from '@eddy-works/never-rest/contract';

export const userSchema = v.object({
  id: v.string(),
  name: v.string(),
});

// Path params, query, and body are declared separately for the typed client.
export const usersContract = {
  getUser: {
    method: 'GET',
    path: '/users/:id',
    params: v.object({ id: v.string() }),
    output: userSchema,
    errors: ['not_found'],
  },
  createUser: {
    method: 'POST',
    path: '/users',
    body: v.object({
      name: v.pipe(v.string(), v.minLength(1)),
    }),
    output: userSchema,
    errors: ['conflict'],
  },
  listUsers: {
    method: 'GET',
    path: '/users',
    output: v.array(userSchema),
    errors: [],
  },
} as const satisfies ContractDef;
