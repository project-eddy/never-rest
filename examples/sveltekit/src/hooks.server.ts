import type { Handle } from '@sveltejs/kit';

import { createUsersServer } from '@never-rest-examples/shared-contract';

const api = createUsersServer({ origin: 'sveltekit-demo' });

function isApiPath(pathname: string): boolean {
  return pathname === '/users' || pathname.startsWith('/users/');
}

export const handle: Handle = async ({ event, resolve }) => {
  if (isApiPath(event.url.pathname)) {
    return api(event.request, undefined);
  }
  return resolve(event);
};
