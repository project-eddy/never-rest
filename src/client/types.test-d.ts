import type { ResultAsync } from 'neverthrow';
import { z } from 'zod';

import type { ClientArgsOf, ClientErrorOf, ContractDef } from '../contract/types.js';
import type { RailError } from '../error.js';
import { createClient } from './create.js';

type Expect<T extends true> = T;
type ExpectNot<T extends false> = T;

const contract = {
  getUser: {
    method: 'GET',
    path: '/users/:id',
    params: z.object({ id: z.string() }),
    output: z.object({ id: z.string(), name: z.string() }),
    errors: { not_found: 404 } as const,
  },
  loadOrders: {
    method: 'GET',
    path: '/users/:userId/orders',
    params: z.object({ userId: z.string() }),
    output: z.object({ orders: z.array(z.string()) }),
    errors: { not_found: 404 } as const,
  },
  listUsers: {
    method: 'GET',
    path: '/users',
    output: z.object({ users: z.array(z.object({ id: z.string() })) }),
    errors: {} as const,
  },
} satisfies ContractDef;

const client = createClient(contract, { baseUrl: 'https://api.example.com' });

type GetUserClientError = ClientErrorOf<(typeof contract)['getUser']>;

type _GetUserResult = Expect<
  ReturnType<typeof client.getUser> extends ResultAsync<
    { id: string; name: string },
    GetUserClientError
  >
    ? true
    : false
>;

const _composed = client
  .getUser({ params: { id: '1' } })
  .andThen((user) => client.loadOrders({ params: { userId: user.id } }))
  .map((orders) => orders.orders.length);

type _ComposedChain = Expect<
  typeof _composed extends ResultAsync<number, GetUserClientError> ? true : false
>;

type _DeclaredCodeAssignable = Expect<
  RailError<'not_found'> extends GetUserClientError ? true : false
>;

type _ValidationInClient = Expect<
  RailError<'validation_error'> extends GetUserClientError ? true : false
>;

type _InternalInClient = Expect<
  RailError<'internal'> extends GetUserClientError ? true : false
>;

type _UnavailableInClient = Expect<
  RailError<'unavailable'> extends GetUserClientError ? true : false
>;

type _UndeclaredCodeNotAssignable = ExpectNot<
  RailError<'database_corrupt'> extends GetUserClientError ? true : false
>;

const _transformContract = {
  getLimit: {
    method: 'GET',
    path: '/limits/:id',
    params: z.object({ id: z.string() }),
    query: z.object({ limit: z.string().transform(Number) }),
    output: z.object({ value: z.number() }),
    errors: {} as const,
  },
} satisfies ContractDef;

type _ClientArgsAcceptsInferInput = Expect<
  ClientArgsOf<(typeof _transformContract)['getLimit']> extends {
    readonly params: { id: string };
    readonly query: { limit: string };
  }
    ? true
    : false
>;

type _ListTakesNoArgs = Expect<
  Parameters<typeof client.listUsers>['length'] extends 0 ? true : false
>;
