# SvelteKit example

## What you will learn

How to import a shared contract, write handlers, call `serve`, and forward
`/users*` from `hooks.server.ts`.

## Read in this order

1. [Shared contract](../packages/shared-contract/README.md) — `usersContract` + `statuses`
2. [`src/hooks.server.ts`](src/hooks.server.ts) — handlers, `serve`, SvelteKit mount

## Protocol win

Handlers return `Result` — no throw middleware. Each mount returns a user
object that still includes `passwordHash`; `serve` serialises the **parsed**
output schema and strips it. Unmatched routes are `route_not_found` (not domain
`not_found`). Omitted `disclosure` defaults to `public`. See
[`../conformance/README.md`](../conformance/README.md).

## What this stack does differently

API traffic is handled in `hooks.server.ts`, not a `+server.ts` file. The hook
forwards `/users` and `/users/…` to never-rest and lets other paths render as
normal pages. `event.request` is already a Web `Request`.

## Run

```bash
pnpm --filter @eddy-works/never-rest build
pnpm --filter @never-rest-examples/sveltekit start
```

Then:

```bash
curl -s http://127.0.0.1:3004/users/ada
curl -s -X POST http://127.0.0.1:3004/users \
  -H 'content-type: application/json' \
  -d '{"name":"Grace Hopper"}'
```
