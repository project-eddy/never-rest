# Next.js App Router example

## What you will learn

How to import a shared contract, write handlers, call `serve`, and mount
behind a Next catch-all `/api` route (with named `GET` / `POST` / … exports).

## Read in this order

1. [Shared contract](../packages/shared-contract/README.md) — `usersContract` + `statuses`
2. [`app/api/[...path]/route.ts`](app/api/[...path]/route.ts) — handlers, `serve`, Next mount

## What this stack does differently

Next puts APIs under `/api/…`. The shared contract uses `/users/:id`. This
file strips `/api` before calling never-rest so the contract stays the same
as in every other example.

## Run

```bash
pnpm --filter @eddy-works/never-rest build
pnpm --filter @never-rest-examples/next-app-router start
```

Then:

```bash
curl -s http://127.0.0.1:3003/api/users/ada
curl -s -X POST http://127.0.0.1:3003/api/users \
  -H 'content-type: application/json' \
  -d '{"name":"Grace Hopper"}'
```
