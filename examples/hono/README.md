# Hono example

## What you will learn

How to import a shared contract, write handlers, call `serve`, and pass
Hono's Web `Request` straight into never-rest.

## Read in this order

1. [Shared contract](../packages/shared-contract/README.md) — `usersContract` + `statuses`
2. [`src/server.ts`](src/server.ts) — handlers, `serve`, Hono mount

## Protocol win

Handlers return `Result` — no throw middleware. Each mount returns a user
object that still includes `passwordHash`; `serve` serialises the **parsed**
output schema and strips it. Unmatched routes are `route_not_found` (not domain
`not_found`). Omitted `disclosure` defaults to `public`. See
[`../conformance/README.md`](../conformance/README.md).

## What this stack does differently

Hono is Fetch-native. `c.req.raw` is already a Web `Request`, so there is no
`toNodeHandler` step.

## Run

```bash
pnpm --filter @eddy-works/never-rest build
pnpm --filter @never-rest-examples/hono start
```

Then in another terminal:

```bash
curl -s http://127.0.0.1:3002/users/ada
curl -s -X POST http://127.0.0.1:3002/users \
  -H 'content-type: application/json' \
  -d '{"name":"Grace Hopper"}'
```
