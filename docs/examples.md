---
title: Examples
description: Mini projects — shared contract across Express, Next, SvelteKit, Hono, Workers, plus Zod/Valibot/ArkType.
---

# Examples

Runnable mini projects live under [`examples/`](../examples/). Read them as four lessons:

1. **Shared contract** — [`packages/shared-contract`](../examples/packages/shared-contract): `usersContract` + `statuses` only
2. **One framework mount** — each stack imports that contract, writes handlers, calls `serve`, then mounts
3. **Gateway** — [`gateway`](../examples/gateway): `chain` + graded disclosure
4. **Validators** — [`validators`](../examples/validators): same contract in Zod, Valibot, and ArkType

| Example | What it shows |
| --- | --- |
| [Express](../examples/express) | Node via `@eddy-works/never-rest/node` (`toNodeHandler`) |
| [Hono](../examples/hono) | Fetch-native mount |
| [Next App Router](../examples/next-app-router) | Catch-all route handlers |
| [SvelteKit](../examples/sveltekit) | `hooks.server.ts` |
| [Cloudflare Workers](../examples/cloudflare-workers) | Worker `fetch` handler |
| [Gateway](../examples/gateway) | `chain` + graded disclosure |
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
  getUser: ({ input }) => ok({ id: input.id, name: 'Ada' }),
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
