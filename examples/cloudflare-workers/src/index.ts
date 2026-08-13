import { err, ok } from 'neverthrow';

import { railError } from '@eddy-works/never-rest';
import { serve, type Handlers } from '@eddy-works/never-rest/server';
import { usersContract } from '@never-rest-examples/shared-contract';

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
 * Return the store record as-is; `serve` parses the output schema and serialises
 * that (extra fields such as `passwordHash` are stripped).
 */
const usersHandlers: Handlers<typeof usersContract, undefined> = {
  getUser: ({ params }) => {
    const user = users.get(params.id);
    if (user === undefined) {
      // Domain miss (resource) — distinct from host `route_not_found` on /nope.
      return err(railError('not_found', `User ${params.id} not found`));
    }
    return ok(user);
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
    return ok(user);
  },

  listUsers: () => ok([...users.values()]),

  ping: () => ok({ ok: true as const }),

  deleteUser: ({ params }) => {
    if (!users.has(params.id)) {
      return err(railError('not_found', `User ${params.id} not found`));
    }
    users.delete(params.id);
    return ok(undefined);
  },
};

// disclosure omitted → `public` (fail-closed at the HTTP edge).
export const usersApi = serve(usersContract, usersHandlers, {
  origin: 'workers-demo',
});

export default {
  fetch(request: Request): Promise<Response> {
    return usersApi(request, undefined);
  },
} satisfies ExportedHandler;
