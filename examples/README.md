# Examples

Runnable mini projects that teach never-rest in four lessons.

**Thesis:** the contract is law at every HTTP boundary. Handlers return
`Result`; wire shapes are schema-parsed; host failures are distinct from
domain failures; clients get an honest `ClientErrorOf` union; disclosure
defaults to fail-closed (`public`).

Framework mounts stay thin — they teach *how to mount*. Smoke and the
gateway prove *why this beats throw-based APIs*.

## Learning path

1. **Lesson 1 — Shared contract**  
   [`packages/shared-contract`](packages/shared-contract)  
   Read `contract.ts`. This package exports only `usersContract`, schemas,
   and `statuses` — no handlers and no `serve`.  
   **Win:** the complete status map is the protocol surface (domain codes +
   `validation_error` / `internal` / `route_not_found`). `unavailable` is
   client-only.

2. **Lesson 2 — Pick one stack**  
   Open that folder’s mount file. Each example imports the contract, writes
   its own handlers, calls `serve(...)`, then shows only what that runtime
   needs to mount the Fetch handler.  
   **Win:** the same law mounts anywhere; unmatched paths are
   `route_not_found` (not domain `not_found`); omitted `disclosure` →
   `public`. Smoke asserts these invariants in-process.

3. **Lesson 3 — Gateway**  
   [`gateway`](gateway)  
   Two in-process services, `chain`, graded disclosure, and
   `ClientErrorOf` (including synthesised `unavailable` on network
   failure).  
   **Win:** cross-service honesty — cause chains for trusted callers,
   fail-closed public edges, typed client failures.

4. **Lesson 4 — Validators**  
   [`validators`](validators)  
   Same users contract in Zod, Valibot, and ArkType. Framework mounts stay
   on Zod; this package is the Standard Schema swap demo.  
   **Win:** schemas *are* the wire law — input validation and always-on
   parsed output.

One contract, many consumers: every framework example imports
`usersContract` from `@never-rest-examples/shared-contract` so you can
compare mounts without rewriting the route table.

## Projects

| Package | Runtime | Port | What the mount teaches |
| --- | --- | --- | --- |
| [`express`](express) | Express (Node) | 3001 | `toNodeHandler` bridges Node ↔ Web Fetch |
| [`hono`](hono) | Hono | 3002 | Native Web `Request` — no adapter |
| [`next-app-router`](next-app-router) | Next.js App Router | 3003 | Catch-all `/api/*` with path prefix strip |
| [`sveltekit`](sveltekit) | SvelteKit | 3004 | `hooks.server.ts` for `/users*` |
| [`cloudflare-workers`](cloudflare-workers) | Cloudflare Workers | 3005 | Worker `fetch` calls `serve()` |
| [`gateway`](gateway) | In-process | — | Cause chains, disclosure, `ClientErrorOf` |
| [`validators`](validators) | In-process | — | Zod / Valibot / ArkType via Standard Schema |

## Run

From the repo root:

```bash
pnpm install
pnpm build
pnpm --filter @never-rest-examples/express start
# or hono / next-app-router / sveltekit / cloudflare-workers / gateway
```

Typecheck all examples:

```bash
pnpm examples:typecheck
```

Protocol smoke (users contract + protocol invariants):

```bash
pnpm examples:smoke
```

See [`smoke/README.md`](smoke/README.md) for what each smoke file proves.
