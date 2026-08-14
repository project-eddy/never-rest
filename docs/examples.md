---
title: Examples
description: Mini projects — shared contract across Express, Next, SvelteKit, Hono, Workers, plus validators and files-and-streams.
---

# Examples

Runnable mini projects live under [`examples/`](../examples/).

**Thesis:** the contract is law at every HTTP boundary. Handlers return
`Result`; wire shapes are schema-parsed; host failures are distinct from
domain failures; clients get an honest `ClientErrorOf` union; disclosure
defaults to fail-closed (`public`).

Read them as five lessons:

1. **Shared contract** — [`packages/shared-contract`](../examples/packages/shared-contract): `usersContract` only (domain statuses on each route).  
   **Win:** the contract is self-contained HTTP truth; host codes (`validation_error` / `internal` / `route_not_found`) are serve defaults; `unavailable` is client-only.
2. **One framework mount** — each stack imports that contract, writes handlers against the shared in-memory users database (`ResultAsync` / `railError`), calls `serve`, then mounts.  
   **Win:** same law mounts anywhere; `basePath` and `handle()` for shared pipelines; unmatched path ≠ resource missing; omitted `disclosure` → `public`.
3. **Gateway** — [`gateway`](../examples/gateway): named contract exports, `chain`, graded disclosure, `ClientErrorOf` / `unavailable`.  
   **Win:** cross-service honesty without throw middleware.
4. **Validators** — [`validators`](../examples/validators): same contract in Zod, Valibot, and ArkType.  
   **Win:** schemas are the wire law (input + always-on parsed output).
5. **Files and streams** — [`files-and-streams`](../examples/files-and-streams): JSON on `serve`; multipart and SSE on sibling host handlers.  
   **Win:** the contract validates JSON shapes; the host owns the bytes. Guide: [files and streams](./files-and-streams.md).

| Example | What it shows |
| --- | --- |
| [Express](../examples/express) | Node via `@eddy-works/never-rest/node` (`toNodeHandler`) |
| [Hono](../examples/hono) | Fetch-native mount |
| [Next App Router](../examples/next-app-router) | Catch-all route handlers + `basePath: '/api'` |
| [SvelteKit](../examples/sveltekit) | `hooks.server.ts` + cooperative `handle()` |
| [Cloudflare Workers](../examples/cloudflare-workers) | Worker `fetch` handler |
| [Gateway](../examples/gateway) | `chain`, disclosure, `ClientErrorOf` |
| [Validators](../examples/validators) | Zod / Valibot / ArkType (Standard Schema) |
| [Files and streams](../examples/files-and-streams) | Sibling multipart + SSE; shadow `RouteDef` |

Yup is not supported: never-rest requires [Standard Schema](https://standardschema.dev/), which Yup does not implement.

See [examples/README.md](https://github.com/project-eddy/never-rest/blob/main/examples/README.md) for ports and commands.

Express mount (same idea in every stack — contract in, handlers + `serve` local):

```ts
import { toNodeHandler } from '@eddy-works/never-rest/node';
import { serve, type Handlers } from '@eddy-works/never-rest/server';
import { usersContract } from '@never-rest-examples/shared-contract';
import { createUsersDb } from '@never-rest-examples/shared-contract/db';

const db = createUsersDb();

const usersHandlers: Handlers<typeof usersContract, undefined> = {
  getUser: ({ params }) => db.getUser(params.id),
  // …
};

const usersApi = serve(usersContract, usersHandlers, {
  origin: 'express-demo',
});

const nodeHandler = toNodeHandler((request) => {
  const context = undefined;
  return usersApi(request, context);
});

app.use(nodeHandler);
```

`toNodeHandler` is a thin `IncomingMessage`/`ServerResponse` bridge — not
Express middleware or an auth framework. Fetch-native runtimes call
`serve()` directly with a Web `Request`.
