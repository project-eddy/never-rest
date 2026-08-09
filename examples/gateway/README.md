# Gateway example (Lesson 3)

## What you will learn

How a gateway wraps a downstream `RailError` with `chain`, and how
`disclosure` changes what the caller sees.

## Read in this order

1. [Shared contract (Lesson 1)](../packages/shared-contract/README.md) — what a contract looks like (optional but useful)
2. [`src/run.ts`](src/run.ts) — inventory → orders → three disclosure prints

There is no HTTP server. The script runs both services in-process and prints
JSON to the terminal.

## What this example shows

1. **Inventory** always returns `not_found`.
2. **Orders** calls inventory through `createClient`, then on failure uses
   `chain(...)` so the inventory error becomes the `cause` of
   `fulfilment_failed`.
3. The same orders handler is served three times:

| Disclosure | Trust level | What you should see |
| --- | --- | --- |
| `full` | Same trust circle | Two-deep cause chain; `origin` and `nextStep` kept |
| `internal` | Staff / internal tools | Cause chain dropped; useful fields kept |
| `public` | Internet client | Cause dropped; diagnostic paths absent from `public` |

At `full`, the script also prints `formatChain` and `disclose(..., 'public')`
so you can compare the helpers without re-running.

## Run

```bash
pnpm --filter @eddy-works/never-rest build
pnpm --filter @never-rest-examples/gateway start
```
