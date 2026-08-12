/**
 * Gateway demo: inventory fails → orders wraps with chain → print at three disclosure levels.
 * No HTTP server — both services run in-process.
 */
import { err, ok } from 'neverthrow';
import { z } from 'zod';

import {
  chain,
  disclose,
  formatChain,
  railError,
  type RailError,
} from '@eddy-works/never-rest';
import type { ContractDef } from '@eddy-works/never-rest/contract';
import { createClient } from '@eddy-works/never-rest/client';
import { serve, type Handlers } from '@eddy-works/never-rest/server';

const statuses = {
  validation_error: 400,
  not_found: 404,
  fulfilment_failed: 502,
  route_not_found: 404,
  internal: 500,
} as const;

const inventoryContract = {
  reserve: {
    method: 'POST',
    path: '/reserve',
    input: z.object({ sku: z.string(), qty: z.number().int().positive() }),
    output: z.object({ reservationId: z.string() }),
    errors: ['not_found'],
  },
} satisfies ContractDef;

const inventoryHandlers: Handlers<typeof inventoryContract, undefined> = {
  // Always fails so the cause chain is visible below.
  reserve: () =>
    err(
      railError('not_found', 'SKU missing from warehouse shelf B-12', {
        origin: 'inventory',
        nextStep: 'Replenish stock or pick an alternate SKU',
      }),
    ),
};

const inventoryFetch = serve(inventoryContract, inventoryHandlers, {
  statuses,
  origin: 'inventory',
  disclosure: 'full',
});

// Fake network: createClient calls this fetch, which hits inventoryFetch in-process.
const inventoryClient = createClient(inventoryContract, {
  baseUrl: 'http://inventory.local',
  credentials: 'include',
  fetch: (input, init) =>
    inventoryFetch(new Request(input, init), undefined),
});

const ordersContract = {
  fulfil: {
    method: 'POST',
    path: '/orders/:id/fulfil',
    input: z.object({ id: z.string(), sku: z.string(), qty: z.number() }),
    output: z.object({ orderId: z.string(), reservationId: z.string() }),
    errors: ['fulfilment_failed', 'not_found'],
  },
} satisfies ContractDef;

const ordersHandlers: Handlers<typeof ordersContract, undefined> = {
  fulfil: async ({ input }) => {
    const reserved = await inventoryClient.reserve({
      sku: input.sku,
      qty: input.qty,
    });

    if (reserved.isErr()) {
      // Keep the downstream error as `cause` for graded disclosure.
      return err(
        chain(
          {
            code: 'fulfilment_failed',
            message: 'Could not reserve inventory for order',
            origin: 'orders',
            nextStep: 'Retry after inventory recovers or cancel the order',
          },
          reserved.error,
        ),
      );
    }

    return ok({
      orderId: input.id,
      reservationId: reserved.value.reservationId,
    });
  },
};

function isRailErrorBody(body: unknown): body is RailError {
  if (body === null || typeof body !== 'object') {
    return false;
  }
  if (!('code' in body) || !('message' in body)) {
    return false;
  }
  return typeof body.code === 'string' && typeof body.message === 'string';
}

async function renderAt(
  label: string,
  disclosure: 'full' | 'internal' | 'public',
): Promise<void> {
  const ordersApi = serve(ordersContract, ordersHandlers, {
    statuses,
    origin: 'orders',
    disclosure,
  });

  const response = await ordersApi(
    new Request('http://orders.local/orders/ord_1/fulfil', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'ord_1', sku: 'SKU-42', qty: 2 }),
    }),
    undefined,
  );
  const body: unknown = await response.json();

  console.log(`\n=== disclosure: ${label} (${disclosure}) ===`);
  console.log('status', response.status);
  console.log(JSON.stringify(body, null, 2));

  if (disclosure === 'full' && isRailErrorBody(body)) {
    console.log('\nformatChain:\n' + formatChain(body));
    console.log(
      '\ndisclose(public):',
      JSON.stringify(disclose(body, 'public')),
    );
  }
}

async function main(): Promise<void> {
  await renderAt('same trust circle', 'full');
  await renderAt('staff / internal tools', 'internal');
  await renderAt('internet client', 'public');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
