# Express example

## What you will learn

How to import a shared contract, write handlers, call `serve`, and mount the
result on Express with `toNodeHandler`.

## Read in this order

1. [Shared contract](../packages/shared-contract/README.md) — `usersContract` and [`createUsersDb()`](../packages/shared-contract/src/db.ts)
2. [`src/handler.ts`](src/handler.ts) — handlers return the database `Result`
3. [`src/server.ts`](src/server.ts) — Express mount

## Protocol win

Handlers stay on the railway: they return `createUsersDb()` Results. `Handlers<typeof usersContract>` rejects undeclared error codes. They return the database row
(including `passwordHash`); `parseOutput` strips undeclared fields before the
response leaves the process. Unmatched routes are `route_not_found` (not domain
`not_found`). Omitted `disclosure` defaults to `public`. See
[`../conformance/README.md`](../conformance/README.md).

## What this stack does differently

Express speaks Node's `IncomingMessage` / `ServerResponse`. never-rest speaks
Web `Request` / `Response`. `@eddy-works/never-rest/node`'s `toNodeHandler`
converts between them.

## Run

```bash
pnpm --filter @eddy-works/never-rest build
pnpm --filter @never-rest-examples/express start
```

Then in another terminal:

```bash
curl -s http://127.0.0.1:3001/users/ada
curl -s -X POST http://127.0.0.1:3001/users \
  -H 'content-type: application/json' \
  -d '{"name":"Grace Hopper"}'
```
