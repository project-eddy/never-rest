---
title: Errors as intelligence
description: RailError fields for agents and gateways — nextStep, origin, retryable, cause chains.
---

# Errors as intelligence

`RailError` is designed for machines and humans who need to **act** on failure — especially agents calling internal APIs through a gateway.

## Fields

| Field | Role |
| --- | --- |
| `code` | Stable machine identifier, declared on the route's `errors` array |
| `message` | Human-readable summary |
| `issues` | Structured validation problems (`path` + `message`) |
| `cause` | Downstream `RailError`, preserved verbatim across hops |
| `origin` | Service name stamped on production (e.g. `inventory`, `orders`) |
| `retryable` | Hint that the same request may succeed later (timeouts, 503-shaped failures) |
| `nextStep` | Actionable instruction — "Use id from GET /users", "Wait 30s and retry" |

`nextStep` is kept at `public` disclosure when it is **advisory** (what to do next), not **diagnostic** (internal field names or stack-derived detail). `disclose` enforces that split.

## Origin

Stamp `origin` on each hop when constructing errors (`railError` / `chain`). `serve` also stamps `options.origin` onto outgoing errors that lack one (recursive on `cause`). Each service in a chain should use a distinct `origin` so `formatChain` and agent tooling can read:

```
[orders] order_failed: Could not fulfil
[inventory] not_found: SKU not in warehouse
```

Without `origin`, multi-service failures collapse into indistinguishable messages.

## Retryable

The client sets `retryable: true` on network-level `unavailable` errors. Handlers can set `retryable` on domain errors (rate limits, transient dependency failures). Agents and orchestrators can branch without parsing HTTP status text:

```ts
const result = await client.reserve({ sku, qty });
if (result.isErr() && result.error.retryable) {
  await sleep(5000);
  return client.reserve({ sku, qty });
}
```

## Gateway composition

A gateway handler calls a downstream never-rest service, receives a JSON `RailError`, and wraps it with `chain`:

```ts
import { err } from 'neverthrow';
import { chain, railError } from '@eddy-works/never-rest';

async function fulfilOrder(orderId: string) {
  const downstream = await inventoryClient.reserve({ orderId });
  if (downstream.isErr()) {
    return err(
      chain(
        {
          code: 'fulfilment_failed',
          message: 'Could not reserve inventory',
          origin: 'orders',
          nextStep: 'Retry after inventory recovers or cancel the order',
        },
        downstream.error,
      ),
    );
  }
  return ok(downstream.value);
}
```

The downstream error's `cause` chain and `origin` survive serialisation. `serve` applies `disclosure` per incoming request (or use `respond({ disclosure })` directly):

- Internal agent with `disclosure: 'full'` sees the full chain and both `nextStep` values.
- Public caller with `disclosure: 'public'` sees only the gateway's safe code/message and advisory `nextStep` — not inventory's internal paths.

See [specs/cause-chaining.md](https://github.com/project-eddy/never-rest/blob/main/specs/cause-chaining.md) (`src/error.test.ts`, `src/server/serve.test.ts`) and [specs/graded-disclosure.md](https://github.com/project-eddy/never-rest/blob/main/specs/graded-disclosure.md) (`src/disclose.test.ts`, `src/server/serve.test.ts`).

## Agents

Agents benefit when errors are **data** rather than exceptions:

1. **Declared codes** on the contract bound what the error channel can carry — no guessing from free-form text.
2. **`nextStep`** reduces tool-chaining loops when the fix is procedural.
3. **`flatten` / `formatChain`** give a deterministic walk of the chain for logging and reflection.
4. **`ResultAsync` on the client** lets agent code use the same `andThen` patterns as server handlers; a failed step does not throw out of the runner.

Contrast with oRPC's `safe()` tuple (branch manually each call) or throw-based servers (catch and lose typed structure).
