import { ok } from 'neverthrow';

import { serve, type Handlers } from '@eddy-works/never-rest/server';
import { usersContract } from '@never-rest-examples/shared-contract';
import { createUsersDb } from '@never-rest-examples/shared-contract/db';

const db = createUsersDb();

/**
 * The database returns Result, so handlers stay on the railway — return it
 * (or `andThen`) instead of wrapping `undefined`. Return the row as-is;
 * `serve` parses the output schema and strips extra fields such as `passwordHash`.
 */
const usersHandlers: Handlers<typeof usersContract, undefined> = {
  getUser: ({ params }) =>
    // Domain miss (resource) — distinct from host `route_not_found` on /nope.
    db.getUser(params.id),

  createUser: ({ body }) => {
    const id = body.name.toLowerCase().replace(/\s+/g, '-');
    return db.insertUser({
      id,
      name: body.name,
      passwordHash: `demo-hash-${id}`,
    });
  },

  listUsers: () => db.listUsers(),

  ping: () => ok({ ok: true as const }),

  deleteUser: ({ params }) => db.deleteUser(params.id),
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
