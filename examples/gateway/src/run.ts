/**
 * Gateway demo (Lesson 3) — cross-service honesty without throw middleware.
 *
 * Flow:
 *   1. Inventory always fails with domain not_found
 *   2. Orders calls inventory via createClient, wraps with chain → fulfilment_failed
 *   3. Same failure rendered at full / internal / public / omitted(→public)
 *   4. A second client with a rejecting fetch shows ClientErrorOf unavailable
 *
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

// --- Status map (domain + host codes; unavailable is client-only) ------------

const statuses = {
  validation_error: 400,
  not_found: 404,
  fulfilment_failed: 502,
  route_not_found: 404,
  internal: 500,
} as const;

// --- 1. Inventory service (always fails) -------------------------------------

const inventoryContract = {
  reserve: {
    method: 'POST',
    path: '/reserve',
    body: z.object({ sku: z.string(), qty: z.number().int().positive() }),
    output: z.object({ reservationId: z.string() }),
    errors: ['not_found'],
  },
} as const satisfies ContractDef;

const inventoryHandlers: Handlers<typeof inventoryContract, undefined> = {
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

const inventoryClient = createClient(inventoryContract, {
  baseUrl: 'http://inventory.local',
  credentials: 'include',
  fetch: (input, init) =>
    inventoryFetch(new Request(input, init), undefined),
});

/** Same contract, broken transport — ClientErrorOf includes synthesised unavailable. */
const unreachableInventoryClient = createClient(inventoryContract, {
  baseUrl: 'http://inventory-down.local',
  credentials: 'include',
  fetch: () => Promise.reject(new TypeError('Failed to fetch')),
});

// --- 2. Orders service (wraps inventory Err with chain) ----------------------

const ordersContract = {
  fulfil: {
    method: 'POST',
    path: '/orders/:id/fulfil',
    params: z.object({ id: z.string() }),
    body: z.object({ sku: z.string(), qty: z.number() }),
    output: z.object({ orderId: z.string(), reservationId: z.string() }),
    errors: ['fulfilment_failed', 'not_found'],
  },
} as const satisfies ContractDef;

const ordersHandlers: Handlers<typeof ordersContract, undefined> = {
  fulfil: async ({ params, body }) => {
    const reserved = await inventoryClient.reserve({
      body: { sku: body.sku, qty: body.qty },
    });

    if (reserved.isErr()) {
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
      orderId: params.id,
      reservationId: reserved.value.reservationId,
    });
  },
};

// --- 3. Print helpers --------------------------------------------------------

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
  disclosure: 'full' | 'internal' | 'public' | undefined,
): Promise<void> {
  const ordersApi = serve(ordersContract, ordersHandlers, {
    statuses,
    origin: 'orders',
    ...(disclosure === undefined ? {} : { disclosure }),
  });

  const response = await ordersApi(
    new Request('http://orders.local/orders/ord_1/fulfil', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sku: 'SKU-42', qty: 2 }),
    }),
    undefined,
  );
  const body: unknown = await response.json();

  const disclosureLabel =
    disclosure === undefined ? 'omitted → public default' : disclosure;
  console.log(`\n=== disclosure: ${label} (${disclosureLabel}) ===`);
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

async function renderUnavailable(): Promise<void> {
  const result = await unreachableInventoryClient.reserve({
    body: { sku: 'SKU-42', qty: 1 },
  });

  console.log('\n=== ClientErrorOf: network failure → unavailable ===');
  if (result.isOk()) {
    console.log('unexpected Ok', result.value);
    return;
  }
  console.log(JSON.stringify(result.error, null, 2));
}

// --- 4. Run ------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Gateway demo
  - inventory always returns not_found
  - orders chains that into fulfilment_failed
  - compare disclosure full / internal / public / omitted(→public)
  - then ClientErrorOf unavailable from a rejecting fetch`);

  await renderAt('same trust circle', 'full');
  await renderAt('staff / internal tools', 'internal');
  await renderAt('internet client', 'public');
  await renderAt('serve() with no disclosure option', undefined);
  await renderUnavailable();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
