import { describe, it } from 'vitest';

import { usersApi as expressUsersApi } from '../express/src/handler.js';
import { usersApi as honoUsersApi } from '../hono/src/handler.js';
import { assertUsersContract } from './assert-users-contract.js';

describe('example HTTP smoke — users contract', () => {
  it('express serve handler', async () => {
    await assertUsersContract('express', expressUsersApi);
  });

  it('hono serve handler', async () => {
    await assertUsersContract('hono', honoUsersApi);
  });
});
