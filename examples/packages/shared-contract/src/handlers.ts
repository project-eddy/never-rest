import { err, ok } from 'neverthrow';

import { railError } from '@eddy-works/never-rest';
import { type Handlers } from '@eddy-works/never-rest/server';

import { usersContract } from './contract.js';

const users = new Map<string, { id: string; name: string }>([
  ['ada', { id: 'ada', name: 'Ada Lovelace' }],
]);

/** In-memory handlers shared by the framework examples. */
export const usersHandlers: Handlers<typeof usersContract, undefined> = {
  getUser: ({ input }) => {
    const user = users.get(input.id);
    if (user === undefined) {
      return err(railError('not_found', `User ${input.id} not found`));
    }
    return ok(user);
  },
  createUser: ({ input }) => {
    const id = input.name.toLowerCase().replace(/\s+/g, '-');
    if (users.has(id)) {
      return err(railError('conflict', `User ${id} already exists`));
    }
    const user = { id, name: input.name };
    users.set(id, user);
    return ok(user);
  },
  listUsers: () => ok([...users.values()]),
};
