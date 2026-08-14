import type { Handle } from '@sveltejs/kit';

import { usersApi } from './handler.js';

/**
 * Cooperative mount — SvelteKit's equivalent of Express `app.use`.
 *
 * `handle()` returns `matched: true` only for contract paths (and wrong-method
 * on those paths). Pages and other routes get `matched: false` and fall
 * through to `resolve`. A `/users*` prefix check would steal unrelated URLs.
 */
export const handle: Handle = async ({ event, resolve }) => {
  const result = await usersApi.handle(event.request, undefined);
  if (result.matched) {
    return result.response;
  }
  return resolve(event);
};
