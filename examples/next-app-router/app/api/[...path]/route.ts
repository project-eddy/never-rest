import { createUsersServer } from '@never-rest-examples/shared-contract';

const handler = createUsersServer({ origin: 'next-demo' });

/** Next mounts under `/api`; contract paths are `/users…` — strip the prefix. */
function toContractRequest(request: Request): Request {
  const url = new URL(request.url);
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    url.pathname = url.pathname.slice('/api'.length) || '/';
    return new Request(url, request);
  }
  return request;
}

async function handle(request: Request): Promise<Response> {
  return handler(toContractRequest(request), undefined);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
