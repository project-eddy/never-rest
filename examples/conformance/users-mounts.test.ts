import { describe, it } from 'vitest';

import { usersApi as expressUsersApi } from '../express/src/handler.js';
import { usersApi as honoUsersApi } from '../hono/src/handler.js';
import { runUsersContractScenarios } from './scenarios/users-contract.js';

describe('users mounts (express + hono)', () => {
  it('express: list / get / domain not_found / route_not_found / create', async () => {
    await runUsersContractScenarios('express', expressUsersApi);
  });

  it('hono: list / get / domain not_found / route_not_found / create', async () => {
    await runUsersContractScenarios('hono', honoUsersApi);
  });
});
