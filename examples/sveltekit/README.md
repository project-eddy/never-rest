# SvelteKit example

## What you will learn

How to import a shared contract, write handlers, call `serve`, and mount
cooperatively from `hooks.server.ts` via `handler.handle()`.

## Read in this order

1. [Shared contract](../packages/shared-contract/README.md) — `usersContract` and [`createUsersDb()`](../packages/shared-contract/src/db.ts)
2. [`src/handler.ts`](src/handler.ts) — handlers return the database `Result`, then `serve`
3. [`src/hooks.server.ts`](src/hooks.server.ts) — SvelteKit mount only

There is no `+server.ts` for `/users`. The hook is the mount.

## Protocol win

Handlers stay on the railway: they return `createUsersDb()` Results. `Handlers<typeof usersContract>` rejects undeclared error codes. They return the database row
(including `passwordHash`); `parseOutput` strips undeclared fields before the
response leaves the process. Unmatched routes are `route_not_found` (not domain
`not_found`). Omitted `disclosure` defaults to `public`. See
[`../conformance/README.md`](../conformance/README.md).

## What this stack does differently

SvelteKit shares one fetch pipeline with pages. Callable `serve()` would answer
every request — including `/` — with JSON `route_not_found`. So the hook calls
`usersApi.handle(event.request)`:

| Result | Meaning |
| --- | --- |
| `matched: true` | Contract path (or wrong method on one) — return the never-rest `Response` |
| `matched: false` | Not on the contract — `resolve(event)` so `+page.svelte` and the rest of the app run |

`event.request` is already a Web `Request`. Do not pre-filter with a `/users*`
prefix; that is not the contract path set.

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
