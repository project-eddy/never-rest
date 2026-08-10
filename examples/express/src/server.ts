import express from 'express';

import { toNodeHandler } from '@eddy-works/never-rest/node';

import { usersApi } from './handler.js';

// Express uses Node IncomingMessage/ServerResponse; never-rest uses Web Request/Response.
const nodeHandler = toNodeHandler((request) => {
  return usersApi(request, undefined);
});

const app = express();
app.use(nodeHandler);

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`express example listening on http://127.0.0.1:${port}`);
  console.log(`  GET  /users`);
  console.log(`  GET  /users/ada`);
  console.log(`  POST /users  {"name":"Grace Hopper"}`);
});
