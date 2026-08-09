import { serve as serveNode } from '@hono/node-server';
import { Hono } from 'hono';
import { err, ok } from 'neverthrow';

import { railError } from '@eddy-works/never-rest';
import { serve, type Handlers } from '@eddy-works/never-rest/server';
import {
  statuses,
  usersContract,
} from '@never-rest-examples/shared-contract';

const users = new Map<string, { id: string; name: string }>([
  ['ada', { id: 'ada', name: 'Ada Lovelace' }],
]);

const usersHandlers: Handlers<typeof usersContract, undefined> = {
  getUser: ({ input }) => {
    const user = users.get(input.id);
    if (user === undefined) {
      return err(railError('not_found', `User ${input.id} not found`));
    }
    return ok(user);
  },

  createUser: ({ input }) => {
    const lowerName = input.name.toLowerCase();
    const id = lowerName.replace(/\s+/g, '-');
    if (users.has(id)) {
      return err(railError('conflict', `User ${id} already exists`));
    }
    const user = { id, name: input.name };
    users.set(id, user);
    return ok(user);
  },

  listUsers: () => ok([...users.values()]),
};

const usersApi = serve(usersContract, usersHandlers, {
  statuses,
  origin: 'hono-demo',
});

const app = new Hono();

// Hono is Fetch-native — c.req.raw is already a Web Request.
app.all('*', (c) => usersApi(c.req.raw, undefined));

const port = Number(process.env.PORT ?? 3002);
serveNode({ fetch: app.fetch, port }, () => {
  console.log(`hono example listening on http://127.0.0.1:${port}`);
  console.log(`  GET  /users`);
  console.log(`  GET  /users/ada`);
  console.log(`  POST /users  {"name":"Grace Hopper"}`);
});
