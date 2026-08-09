---
title: Examples
description: Mini projects — shared contract across Express, Next, SvelteKit, Hono, and Cloudflare Workers.
---

# Examples

Runnable mini projects live under [`examples/`](../examples/). They share [`@never-rest-examples/shared-contract`](../examples/packages/shared-contract) so the import story matches ts-rest: one contract, many consumers.

| Example | What it shows |
| --- | --- |
| [Express](../examples/express) | Node via `@eddy-works/never-rest/node` (`toNodeHandler`) |
| [Hono](../examples/hono) | Fetch-native mount |
| [Next App Router](../examples/next-app-router) | Catch-all route handlers |
| [SvelteKit](../examples/sveltekit) | `hooks.server.ts` |
| [Cloudflare Workers](../examples/cloudflare-workers) | Worker `fetch` handler |
| [Gateway](../examples/gateway) | `chain` + graded disclosure |

See [examples/README.md](../examples/README.md) for ports and commands.

```ts
import { createUsersServer } from '@never-rest-examples/shared-contract';
import { toNodeHandler } from '@eddy-works/never-rest/node';

const handler = createUsersServer({ origin: 'express-demo' });
app.use(toNodeHandler((request) => handler(request, undefined)));
```

`toNodeHandler` is a thin `IncomingMessage`/`ServerResponse` bridge — not Express middleware or an auth framework. Fetch-native runtimes call `serve()` (or `createUsersServer()`) directly.
