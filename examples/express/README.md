# Express example

Mounts `serve()` behind `@eddy-works/never-rest/node`'s `toNodeHandler`.

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

Same contract as the other framework examples: `@never-rest-examples/shared-contract`.
