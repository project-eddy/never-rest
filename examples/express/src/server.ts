import express from 'express';

import { toNodeHandler } from '@eddy-works/never-rest/node';
import { createUsersServer } from '@never-rest-examples/shared-contract';

const handler = createUsersServer({ origin: 'express-demo' });
const app = express();

app.use(toNodeHandler((request) => handler(request, undefined)));

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`express example listening on http://127.0.0.1:${port}`);
  console.log(`  GET  /users`);
  console.log(`  GET  /users/ada`);
  console.log(`  POST /users  {"name":"Grace Hopper"}`);
});
