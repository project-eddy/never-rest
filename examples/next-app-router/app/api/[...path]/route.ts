import { err, ok } from 'neverthrow';

import { railError } from '@eddy-works/never-rest';
import { serve, type Handlers } from '@eddy-works/never-rest/server';
import {
  statuses,
  usersContract,
} from '@never-rest-examples/shared-contract';

const users = new Map<string, { id: string; name: string }>([
  ['ada', { id: 'ada', name: 'Ada Lovelace' }],
]);

const usersHandlers: Handlers<typeof usersContract, undefined> = {
  getUser: ({ input }) => {
    const user = users.get(input.id);
    if (user === undefined) {
      return err(railError('not_found', `User ${input.id} not found`));
    }
    return ok(user);
  },

  createUser: ({ input }) => {
    const lowerName = input.name.toLowerCase();
    const id = lowerName.replace(/\s+/g, '-');
    if (users.has(id)) {
      return err(railError('conflict', `User ${id} already exists`));
    }
    const user = { id, name: input.name };
    users.set(id, user);
    return ok(user);
  },

  listUsers: () => ok([...users.values()]),
};

const usersApi = serve(usersContract, usersHandlers, {
  statuses,
  origin: 'next-demo',
});

// Next mounts this under /api/*; the contract paths are /users… — strip the prefix.
function toContractRequest(request: Request): Request {
  const url = new URL(request.url);
  const pathname = url.pathname;

  const isUnderApi =
    pathname === '/api' || pathname.startsWith('/api/');

  if (!isUnderApi) {
    return request;
  }

  const withoutApiPrefix = pathname.slice('/api'.length) || '/';
  url.pathname = withoutApiPrefix;

  return new Request(url, request);
}

export async function GET(request: Request): Promise<Response> {
  return usersApi(toContractRequest(request), undefined);
}

export async function POST(request: Request): Promise<Response> {
  return usersApi(toContractRequest(request), undefined);
}

export async function PUT(request: Request): Promise<Response> {
  return usersApi(toContractRequest(request), undefined);
}

export async function PATCH(request: Request): Promise<Response> {
  return usersApi(toContractRequest(request), undefined);
}

export async function DELETE(request: Request): Promise<Response> {
  return usersApi(toContractRequest(request), undefined);
}
