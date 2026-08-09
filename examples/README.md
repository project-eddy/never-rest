# Examples

Runnable mini projects that teach never-rest in three lessons.

## Learning path

1. **Lesson 1 — Shared contract**  
   [`packages/shared-contract`](packages/shared-contract)  
   Read `contract.ts`. This package exports only `usersContract`, schemas,
   and `statuses` — no handlers and no `serve`.

2. **Lesson 2 — Pick one stack**  
   Open that folder’s mount file. Each example imports the contract, writes
   its own handlers, calls `serve(...)`, then shows only what that runtime
   needs to mount the Fetch handler.

3. **Lesson 3 — Gateway**  
   [`gateway`](gateway)  
   Two in-process services, `chain`, and graded disclosure (`full` /
   `internal` / `public`).

Validators other than Zod (Valibot, ArkType, …) work the same via Standard
Schema. These demos use Zod so the examples stay short.

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
| [`gateway`](gateway) | In-process | — | Cause chains + graded disclosure |

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
