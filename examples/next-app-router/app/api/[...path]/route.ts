import { usersApi } from '../../../handler.js';

/**
 * App Router requires a named export per verb. The catch-all forwards every
 * method to `serve` so never-rest owns routing, including `route_not_found`.
 */
function handle(request: Request): Promise<Response> {
  return usersApi(request, undefined);
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
};
