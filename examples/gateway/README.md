# Gateway example (Lesson 3)

## What you will learn

How a gateway wraps a downstream `RailError` with `chain`, how `disclosure`
changes what the caller sees (including the omitted → `public` default), and
how `createClient` returns an honest `ClientErrorOf` union — domain codes
plus `validation_error`, `internal`, and synthesised `unavailable` on
network failure.

## Read in this order

1. [Shared contract (Lesson 1)](../packages/shared-contract/README.md) — what a contract looks like (optional but useful)
2. [`src/run.ts`](src/run.ts) — inventory → orders → disclosure prints + unavailable

There is no HTTP server. The script runs both services in-process and prints
JSON to the terminal.

## Protocol win

Cross-service honesty without throw middleware: cause chains for trusted
callers, fail-closed public edges, and typed client failures you can
`match` / `andThen` instead of `try/catch`.

## What this example shows

1. **Inventory** always returns `not_found`.
2. **Orders** calls inventory through `createClient` (with `credentials:
   'include'` to show the option, even though this in-process demo does not
   rely on browser cookies), then on failure uses `chain(...)` so the inventory
   error becomes the `cause` of `fulfilment_failed`.
3. The same orders handler is served four times:

| Disclosure | Trust level | What you should see |
| --- | --- | --- |
| `full` | Same trust circle | Two-deep cause chain; `origin` and `nextStep` kept |
| `internal` | Staff / internal tools | Cause chain dropped; useful fields kept |
| `public` | Internet client | Cause dropped; diagnostic paths absent from `public` |
| *(omitted)* | Default edge | Same as `public` — `serve()` defaults disclosure to `public` |

At `full`, the script also prints `formatChain` and `disclose(..., 'public')`
so you can compare the helpers without re-running.

4. A second `createClient` whose `fetch` rejects prints `unavailable`
   (`retryable: true`) — the client-synthesised member of `ClientErrorOf`.

## Run

```bash
pnpm --filter @eddy-works/never-rest build
pnpm --filter @never-rest-examples/gateway start
```
