# Examples conformance

In-process checks that the example apps still obey the shared users contract.
No HTTP server is started — tests call `serve` handlers directly.

```bash
pnpm exec vitest run --config examples/conformance/vitest.config.ts
```

## What each file proves

| File | What it checks |
| --- | --- |
| [`users-mounts.test.ts`](users-mounts.test.ts) | Express, Hono, Next (`basePath`), and SvelteKit (`handle()`) mounts against the shared users contract |
| [`files-and-streams.test.ts`](files-and-streams.test.ts) | Sibling multipart + SSE dispatch: `handle()` unmatched for `/uploads`, JSON `validation_error` on missing title, `createClient` has no upload method, SSE after a successful gate, served `/assets` stays on the railway |
| [`scenarios/users-contract.ts`](scenarios/users-contract.ts) | List → ping (headers) → get Ada → domain `not_found` → host `route_not_found` (or wrong-method `route_not_found` on cooperative mounts) → create `201` → delete `204` (and proves `passwordHash` never leaves on the wire) |

Cloudflare Workers copies the same handler pattern as Hono; it is not imported here
to avoid Workers-specific types in the conformance runner.

Library protocol edge cases (parsed output stripping, undeclared errors,
client `unavailable`) live in `src/protocol/` and run under `pnpm test`.
