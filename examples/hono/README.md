# Hono example

Passes Hono's native Web `Request` straight into `serve()` — no Node adapter.

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

Same contract as the other framework examples: `@never-rest-examples/shared-contract`.
