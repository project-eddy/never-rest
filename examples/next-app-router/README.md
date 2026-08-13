# Next.js App Router example

## What you will learn

How to import a shared contract, write handlers, call `serve`, and mount
behind a Next catch-all `/api` route (with named `GET` / `POST` / … exports).

## Read in this order

1. [Shared contract](../packages/shared-contract/README.md) — `usersContract`
2. [`app/api/[...path]/route.ts`](app/api/[...path]/route.ts) — handlers, `serve`, Next mount

## Protocol win

Handlers return `Result` — no throw middleware. Each mount returns a user
object that still includes `passwordHash`; `serve` serialises the **parsed**
output schema and strips it. Unmatched routes are `route_not_found` (not domain
`not_found`). Omitted `disclosure` defaults to `public`. See
[`../conformance/README.md`](../conformance/README.md).

## What this stack does differently

Next puts APIs under `/api/…`. The shared contract uses `/users/:id`. Pass
`basePath: '/api'` to `serve` so requests keep their real URL — no manual
prefix stripping.

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
