# Express example

## What you will learn

How to import a shared contract, write handlers, call `serve`, and mount the
result on Express with `toNodeHandler`.

## Read in this order

1. [Shared contract](../packages/shared-contract/README.md) — `usersContract` + `statuses`
2. [`src/server.ts`](src/server.ts) — handlers, `serve`, Express mount

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
