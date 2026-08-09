# Next.js App Router example

Catch-all route handlers forward the Web `Request` into `serve()`.

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

Same contract as the other framework examples: `@never-rest-examples/shared-contract`.

HTTP paths are under `/api/…` (Next App Router convention). The route handler strips the `/api` prefix before `serve()`, so contract paths stay `/users/:id` etc.
