# Examples

Mini projects that share one contract and show never-rest on different runtimes.
Validators other than Zod (Valibot, ArkType, …) work the same via Standard Schema — these demos use Zod for brevity.

## Shared contract

[`packages/shared-contract`](packages/shared-contract) exports `usersContract`, `statuses`, `usersHandlers`, and `createUsersServer`.

Every framework example imports that package — same shape as the ts-rest “one contract, many consumers” story.

Path params (e.g. `:id`) are declared on `input` so the typed client can build URLs.

## Projects

| Package | Runtime | Port | Bridge |
| --- | --- | --- | --- |
| [`express`](express) | Express (Node) | 3001 | `@eddy-works/never-rest/node` → `toNodeHandler` |
| [`hono`](hono) | Hono | 3002 | Native Web `Request` |
| [`next-app-router`](next-app-router) | Next.js App Router | 3003 | Catch-all route (`/api/*` → contract paths) |
| [`sveltekit`](sveltekit) | SvelteKit | 3004 | `hooks.server.ts` for `/users*` |
| [`cloudflare-workers`](cloudflare-workers) | Cloudflare Workers | 3005 | Worker `fetch` = `serve()` |
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
