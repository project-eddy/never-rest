# Cloudflare Workers example

## What you will learn

How to import a shared contract, write handlers, call `serve`, and export
the result as a Worker `fetch` handler.

## Read in this order

1. [Shared contract](../packages/shared-contract/README.md) — `usersContract` + `statuses`
2. [`src/index.ts`](src/index.ts) — handlers, `serve`, Worker mount

## Protocol win

Handlers return `Result` — no throw middleware. Each mount returns a user
object that still includes `passwordHash`; `serve` serialises the **parsed**
output schema and strips it. Unmatched routes are `route_not_found` (not domain
`not_found`). Omitted `disclosure` defaults to `public`. See
[`../conformance/README.md`](../conformance/README.md).

## What this stack does differently

Workers are Fetch-native. There is no framework adapter and no path rewriting.
The default export's `fetch` method calls the never-rest handler.

## Run

```bash
pnpm --filter @eddy-works/never-rest build
pnpm --filter @never-rest-examples/cloudflare-workers start
```

Then:

```bash
curl -s http://127.0.0.1:3005/users/ada
curl -s -X POST http://127.0.0.1:3005/users \
  -H 'content-type: application/json' \
  -d '{"name":"Grace Hopper"}'
```
