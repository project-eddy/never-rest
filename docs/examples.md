---
title: Examples
description: Mini projects — shared contract across Express, Next, SvelteKit, Hono, Workers, plus Zod/Valibot/ArkType.
---

# Examples

Runnable mini projects live under [`examples/`](../examples/).

**Thesis:** the contract is law at every HTTP boundary. Handlers return
`Result`; wire shapes are schema-parsed; host failures are distinct from
domain failures; clients get an honest `ClientErrorOf` union; disclosure
defaults to fail-closed (`public`).

Read them as four lessons:

1. **Shared contract** — [`packages/shared-contract`](../examples/packages/shared-contract): `usersContract` + `statuses` only.  
   **Win:** complete status map = protocol surface (`validation_error` / `internal` / `route_not_found` + domain codes); `unavailable` is client-only.
2. **One framework mount** — each stack imports that contract, writes handlers, calls `serve`, then mounts.  
   **Win:** same law mounts anywhere; unmatched path ≠ resource missing; omitted `disclosure` → `public`.
3. **Gateway** — [`gateway`](../examples/gateway): `chain`, graded disclosure, `ClientErrorOf` / `unavailable`.  
   **Win:** cross-service honesty without throw middleware.
4. **Validators** — [`validators`](../examples/validators): same contract in Zod, Valibot, and ArkType.  
   **Win:** schemas are the wire law (input + always-on parsed output).

| Example | What it shows |
| --- | --- |
| [Express](../examples/express) | Node via `@eddy-works/never-rest/node` (`toNodeHandler`) |
| [Hono](../examples/hono) | Fetch-native mount |
| [Next App Router](../examples/next-app-router) | Catch-all route handlers |
| [SvelteKit](../examples/sveltekit) | `hooks.server.ts` + `isContractPath` |
| [Cloudflare Workers](../examples/cloudflare-workers) | Worker `fetch` handler |
| [Gateway](../examples/gateway) | `chain`, disclosure, `ClientErrorOf` |
| [Validators](../examples/validators) | Zod / Valibot / ArkType (Standard Schema) |

Yup is not supported: never-rest requires [Standard Schema](https://standardschema.dev/), which Yup does not implement.

See [examples/README.md](https://github.com/project-eddy/never-rest/blob/main/examples/README.md) for ports and commands.

Express mount (same idea in every stack — contract in, handlers + `serve` local):

```ts
import { err, ok } from 'neverthrow';
import { railError } from '@eddy-works/never-rest';
import { toNodeHandler } from '@eddy-works/never-rest/node';
import { serve, type Handlers } from '@eddy-works/never-rest/server';
import {
  statuses,
  usersContract,
} from '@never-rest-examples/shared-contract';

const usersHandlers: Handlers<typeof usersContract, undefined> = {
  getUser: ({ params }) => ok({ id: params.id, name: 'Ada' }),
  // …
};

const usersApi = serve(usersContract, usersHandlers, {
  statuses,
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
