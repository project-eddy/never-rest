# SvelteKit example

`hooks.server.ts` intercepts `/users*` and passes the Web `Request` into `serve()`.

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

Same contract as the other framework examples: `@never-rest-examples/shared-contract`.
