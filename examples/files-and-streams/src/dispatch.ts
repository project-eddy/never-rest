import { api } from './handlers.js';
import { handleEvents, handleUpload } from './host.js';

export { api } from './handlers.js';
export { catalogContract } from './contract.js';

/**
 * Host paths first so `handle()` never sees `/uploads` or `/jobs/:id/events`.
 * Contract paths go through cooperative `handle()`; anything else is 404.
 */
export async function dispatch(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/uploads') {
    return handleUpload(request);
  }
  if (request.method === 'GET' && url.pathname.match(/^\/jobs\/[^/]+\/events$/)) {
    return handleEvents(request);
  }

  const result = await api.handle(request, undefined);
  if (result.matched) {
    return result.response;
  }
  return new Response('Not Found', { status: 404 });
}
