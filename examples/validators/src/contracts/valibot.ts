import * as v from 'valibot';

import type { ContractDef } from '@eddy-works/never-rest/contract';

export const userSchema = v.object({
  id: v.string(),
  name: v.string(),
});

// Every `:param` in path must also appear in `input` (needed for the typed client).
export const usersContract = {
  getUser: {
    method: 'GET',
    path: '/users/:id',
    input: v.object({ id: v.string() }),
    output: userSchema,
    errors: ['not_found'],
  },
  createUser: {
    method: 'POST',
    path: '/users',
    input: v.object({
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
} satisfies ContractDef;
