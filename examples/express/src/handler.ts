import { err, ok } from 'neverthrow';

import { railError } from '@eddy-works/never-rest';
import { serve, type Handlers } from '@eddy-works/never-rest/server';
import {
  statuses,
  usersContract,
} from '@never-rest-examples/shared-contract';

type UserRecord = { id: string; name: string; passwordHash: string };

const users = new Map<string, UserRecord>([
  [
    'ada',
    {
      id: 'ada',
      name: 'Ada Lovelace',
      // Stored server-side only — must never appear on the wire.
      passwordHash: 'demo-hash-ada',
    },
  ],
]);

/**
 * Handlers return Result — expected failures are `err(railError(...))`, not throws.
 * `serve` always serialises the **parsed** output schema, so extra fields below
 * are stripped before the response leaves the process.
 */
const usersHandlers: Handlers<typeof usersContract, undefined> = {
  getUser: ({ params }) => {
    const user = users.get(params.id);
    if (user === undefined) {
      // Domain miss (resource) — distinct from host `route_not_found` on /nope.
      return err(railError('not_found', `User ${params.id} not found`));
    }
    const wireCandidate = {
      id: user.id,
      name: user.name,
      passwordHash: user.passwordHash,
    };
    return ok(wireCandidate);
  },

  createUser: ({ body }) => {
    const lowerName = body.name.toLowerCase();
    const id = lowerName.replace(/\s+/g, '-');
    if (users.has(id)) {
      return err(railError('conflict', `User ${id} already exists`));
    }
    const user: UserRecord = {
      id,
      name: body.name,
      passwordHash: `demo-hash-${id}`,
    };
    users.set(id, user);
    const wireCandidate = {
      id: user.id,
      name: user.name,
      passwordHash: user.passwordHash,
    };
    return ok(wireCandidate);
  },

  listUsers: () => {
    const wireCandidates = [...users.values()].map((user) => ({
      id: user.id,
      name: user.name,
      passwordHash: user.passwordHash,
    }));
    return ok(wireCandidates);
  },
};

// disclosure omitted → `public` (fail-closed at the HTTP edge).
export const usersApi = serve(usersContract, usersHandlers, {
  statuses,
  origin: 'express-demo',
});
