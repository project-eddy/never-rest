# SvelteKit example

## What you will learn

How to import a shared contract, write handlers, call `serve`, and dispatch
cooperatively from `hooks.server.ts` via `handler.handle()`.

## Read in this order

1. [Shared contract](../packages/shared-contract/README.md) — `usersContract` and [`createUsersDb()`](../packages/shared-contract/src/db.ts)
2. [`src/hooks.server.ts`](src/hooks.server.ts) — handlers return the database `Result`, then cooperative `handle()`

## Protocol win

Handlers stay on the railway: they return `createUsersDb()` Results. `Handlers<typeof usersContract>` rejects undeclared error codes. They return the database row
(including `passwordHash`); `parseOutput` strips undeclared fields before the
response leaves the process. Unmatched routes are `route_not_found` (not domain
`not_found`). Omitted `disclosure` defaults to `public`. See
[`../conformance/README.md`](../conformance/README.md).

## What this stack does differently

API traffic is handled in `hooks.server.ts`, not a `+server.ts` file. The hook
calls `usersApi.handle(event.request)` — `matched: true` returns the never-rest
response; `matched: false` falls through to SvelteKit pages. A `/users*` prefix
heuristic would steal unrelated routes. `event.request` is already a Web
`Request`.

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
