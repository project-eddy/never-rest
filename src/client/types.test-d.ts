import type { ResultAsync } from 'neverthrow';
import { z } from 'zod';

import type { ContractDef, ErrorOf } from '../contract/types.js';
import type { RailError } from '../error.js';
import { createClient } from './create.js';

type Expect<T extends true> = T;
type ExpectNot<T extends false> = T;

const contract = {
  getUser: {
    method: 'GET',
    path: '/users/:id',
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string(), name: z.string() }),
    errors: ['not_found'] as const,
  },
  loadOrders: {
    method: 'GET',
    path: '/users/:userId/orders',
    input: z.object({ userId: z.string() }),
    output: z.object({ orders: z.array(z.string()) }),
    errors: ['not_found'] as const,
  },
} satisfies ContractDef;

const client = createClient(contract, { baseUrl: 'https://api.example.com' });

type _GetUserResult = Expect<
  ReturnType<typeof client.getUser> extends ResultAsync<
    { id: string; name: string },
    RailError<'not_found'>
  >
    ? true
    : false
>;

const _composed = client
  .getUser({ id: '1' })
  .andThen((user) => client.loadOrders({ userId: user.id }))
  .map((orders) => orders.orders.length);

type _ComposedChain = Expect<
  typeof _composed extends ResultAsync<number, RailError<'not_found'>> ? true : false
>;

type GetUserError = ErrorOf<(typeof contract)['getUser']>;

type _UndeclaredCodeNotAssignable = ExpectNot<
  RailError<'database_corrupt'> extends GetUserError ? true : false
>;

type _DeclaredCodeAssignable = Expect<
  RailError<'not_found'> extends GetUserError ? true : false
>;
