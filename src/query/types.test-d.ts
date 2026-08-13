import type { Result } from 'neverthrow';
import { z } from 'zod';

import { createClient } from '../client/create.js';
import type { ClientErrorOf, ContractDef } from '../contract/types.js';
import { createMutationOptions, createQueryOptions } from './index.js';

type Expect<T extends true> = T;

const contract = {
  getUser: {
    method: 'GET',
    path: '/users/:id',
    params: z.object({ id: z.string() }),
    output: z.object({ id: z.string(), name: z.string() }),
    errors: { not_found: 404 } as const,
  },
  listUsers: {
    method: 'GET',
    path: '/users',
    output: z.object({ users: z.array(z.object({ id: z.string() })) }),
    errors: {} as const,
  },
  createUser: {
    method: 'POST',
    path: '/users',
    body: z.object({ email: z.string().email() }),
    output: z.object({ id: z.string() }),
    errors: { conflict: 409 } as const,
  },
} satisfies ContractDef;

const client = createClient(contract, { baseUrl: 'https://api.example.com' });
const _queries = createQueryOptions(client);
const _mutations = createMutationOptions(client);

type GetUserError = ClientErrorOf<(typeof contract)['getUser']>;
type GetUserOutput = { id: string; name: string };

type _QueryFnReturnsResult = Expect<
  ReturnType<ReturnType<typeof _queries.getUser>['queryFn']> extends Promise<
    Result<GetUserOutput, GetUserError>
  >
    ? true
    : false
>;

type _MutationFnReturnsResult = Expect<
  ReturnType<ReturnType<typeof _mutations.createUser>['mutationFn']> extends Promise<
    Result<{ id: string }, ClientErrorOf<(typeof contract)['createUser']>>
  >
    ? true
    : false
>;

type _ListUsersNoArgs = Expect<
  Parameters<typeof _queries.listUsers>['length'] extends 0 | 1 ? true : false
>;
