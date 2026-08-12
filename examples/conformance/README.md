# Examples conformance

In-process checks that the example apps still obey the shared users contract.
No HTTP server is started — tests call `serve` handlers directly.

```bash
pnpm exec vitest run --config examples/conformance/vitest.config.ts
```

## What each file proves

| File | What it checks |
| --- | --- |
| [`users-mounts.test.ts`](users-mounts.test.ts) | Express + Hono mounts against the shared users contract |
| [`scenarios/users-contract.ts`](scenarios/users-contract.ts) | List → get Ada → domain `not_found` → host `route_not_found` → create (and proves `passwordHash` never leaves on the wire) |

Framework mounts under next / sveltekit / workers are not imported here; they
copy the same handler pattern. Express and Hono are enough to guard the shared
contract behaviour.

Library protocol edge cases (parsed output stripping, undeclared errors,
client `unavailable`) live in `src/protocol/` and run under `pnpm test`.
