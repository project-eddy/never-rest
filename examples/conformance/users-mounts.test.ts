import { describe, it } from 'vitest';

import { usersApi as expressUsersApi } from '../express/src/handler.js';
import { usersApi as honoUsersApi } from '../hono/src/handler.js';
import { usersApi as nextUsersApi } from '../next-app-router/app/api/[...path]/route.js';
import { usersApi as sveltekitUsersApi } from '../sveltekit/src/hooks.server.js';
import { runUsersContractScenarios } from './scenarios/users-contract.js';

describe('users mounts (express + hono)', () => {
  it('express: list / ping / get / domain not_found / route_not_found / create 201 / delete 204', async () => {
    await runUsersContractScenarios('express', expressUsersApi);
  });

  it('hono: list / ping / get / domain not_found / route_not_found / create 201 / delete 204', async () => {
    await runUsersContractScenarios('hono', honoUsersApi);
  });
});

describe('users mounts (next basePath + sveltekit handle)', () => {
  it('next: contract paths under /api via basePath', async () => {
    await runUsersContractScenarios('next', nextUsersApi, { urlPrefix: '/api' });
  });

  it('sveltekit: cooperative handle() on contract paths', async () => {
    const cooperativeMount: typeof sveltekitUsersApi = async (
      request,
      context,
    ) => {
      const result = await sveltekitUsersApi.handle(request, context);
      if (result.matched) {
        return result.response;
      }
      return new Response('Not Found', { status: 404 });
    };

    await runUsersContractScenarios('sveltekit', cooperativeMount, {
      cooperativeMount: true,
    });
  });
});
