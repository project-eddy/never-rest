import { serve as serveNode } from '@hono/node-server';
import { Hono } from 'hono';

import { usersApi } from './handler.js';

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
