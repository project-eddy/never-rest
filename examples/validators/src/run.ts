/**
 * Same users contract, three Standard Schema validators.
 * Smoke: serve each, hit valid create + invalid create, print statuses.
 */
import { err, ok } from 'neverthrow';

import { railError } from '@eddy-works/never-rest';
import type { ContractDef } from '@eddy-works/never-rest/contract';
import { serve, type Handlers } from '@eddy-works/never-rest/server';

import { usersContract as arktypeContract } from './contracts/arktype.js';
import { usersContract as valibotContract } from './contracts/valibot.js';
import { usersContract as zodContract } from './contracts/zod.js';

type User = { id: string; name: string };

function createHandlers<TContract extends ContractDef>(
  contract: TContract,
): Handlers<TContract, undefined> {
  void contract;
  const users = new Map<string, User>([
    ['ada', { id: 'ada', name: 'Ada Lovelace' }],
  ]);

  const handlers = {
    getUser: ({ params }: { params: { id: string } }) => {
      const user = users.get(params.id);
      if (user === undefined) {
        return err(railError('not_found', `User ${params.id} not found`));
      }
      return ok(user);
    },
    createUser: ({ body }: { body: { name: string } }) => {
      const id = body.name.toLowerCase().replace(/\s+/g, '-');
      const user = { id, name: body.name };
      users.set(id, user);
      return ok(user);
    },
    listUsers: () => ok([...users.values()]),
    ping: () => ok({ ok: true as const }),
    deleteUser: ({ params }: { params: { id: string } }) => {
      if (!users.has(params.id)) {
        return err(railError('not_found', `User ${params.id} not found`));
      }
      users.delete(params.id);
      return ok(undefined);
    },
  };

  return handlers as Handlers<TContract, undefined>;
}

async function smoke<TContract extends ContractDef>(
  label: string,
  contract: TContract,
): Promise<void> {
  const api = serve(contract, createHandlers(contract), {
    origin: `${label}-demo`,
  });

  const valid = await api(
    new Request('http://validators.local/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Grace Hopper' }),
    }),
    undefined,
  );

  const invalid = await api(
    new Request('http://validators.local/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    }),
    undefined,
  );

  console.log(
    `${label.padEnd(8)} valid=${valid.status}  invalid=${invalid.status}`,
  );
}

await smoke('zod', zodContract);
await smoke('arktype', arktypeContract);
await smoke('valibot', valibotContract);
