import { err, ok } from 'neverthrow';

import { railError } from '@eddy-works/never-rest';
import { serve, type Handlers } from '@eddy-works/never-rest/server';
import {
  statuses,
  usersContract,
} from '@never-rest-examples/shared-contract';

type UserRecord = { id: string; name: string; passwordHash: string };

const users = new Map<string, UserRecord>([
  [
    'ada',
    {
      id: 'ada',
      name: 'Ada Lovelace',
      // Stored server-side only — must never appear on the wire.
      passwordHash: 'demo-hash-ada',
    },
  ],
]);

/**
 * Handlers return Result — expected failures are `err(railError(...))`, not throws.
 * `serve` always serialises the **parsed** output schema, so extra fields below
 * are stripped before the response leaves the process.
 */
const usersHandlers: Handlers<typeof usersContract, undefined> = {
  getUser: ({ params }) => {
    const user = users.get(params.id);
    if (user === undefined) {
      // Domain miss (resource) — distinct from host `route_not_found` on /nope.
      return err(railError('not_found', `User ${params.id} not found`));
    }
    const wireCandidate = {
      id: user.id,
      name: user.name,
      passwordHash: user.passwordHash,
    };
    return ok(wireCandidate);
  },

  createUser: ({ body }) => {
    const lowerName = body.name.toLowerCase();
    const id = lowerName.replace(/\s+/g, '-');
    if (users.has(id)) {
      return err(railError('conflict', `User ${id} already exists`));
    }
    const user: UserRecord = {
      id,
      name: body.name,
      passwordHash: `demo-hash-${id}`,
    };
    users.set(id, user);
    const wireCandidate = {
      id: user.id,
      name: user.name,
      passwordHash: user.passwordHash,
    };
    return ok(wireCandidate);
  },

  listUsers: () => {
    const wireCandidates = [...users.values()].map((user) => ({
      id: user.id,
      name: user.name,
      passwordHash: user.passwordHash,
    }));
    return ok(wireCandidates);
  },
};

// disclosure omitted → `public` (fail-closed at the HTTP edge).
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
