# Examples smoke

In-process checks that the examples still obey the protocol. No HTTP server is
started — tests call `serve` handlers (and `createClient`) directly.

```bash
pnpm examples:smoke
```

## What each file proves

| File | What you are looking at |
| --- | --- |
| [`users-mounts.test.ts`](users-mounts.test.ts) | Express + Hono mounts against the shared users contract |
| [`scenarios/users-contract.ts`](scenarios/users-contract.ts) | Named steps: list → get Ada → domain `not_found` → host `route_not_found` → create (and proves `passwordHash` never leaves on the wire) |
| [`protocol/fixture.ts`](protocol/fixture.ts) | Tiny local contract used only by protocol scenarios |
| [`protocol/parsed-output.test.ts`](protocol/parsed-output.test.ts) | Handler returns extra fields → wire JSON matches the output schema only |
| [`protocol/undeclared-error.test.ts`](protocol/undeclared-error.test.ts) | Undeclared handler code → wire `internal`; omitted disclosure hides `cause` |
| [`protocol/unavailable-client.test.ts`](protocol/unavailable-client.test.ts) | Rejecting `fetch` → `ClientErrorOf` code `unavailable` |

## Read order

1. Open an example handler (e.g. [`../express/src/handler.ts`](../express/src/handler.ts)) — note `passwordHash` on the `Ok` value and the missing `disclosure` option.
2. Read [`scenarios/users-contract.ts`](scenarios/users-contract.ts) — same handler, assert what crossed the wire.
3. Skim the three `protocol/*.test.ts` files for edge cases mounts do not exercise.

Framework mounts under next / sveltekit / workers are not imported here; they
copy the same handler pattern. Express and Hono are enough to guard the shared
contract behaviour.
