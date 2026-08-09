# never-rest

HTTP contracts where handlers return `Result` instead of throwing. Errors carry their cause chain across service boundaries. Disclosure is graded by caller trust — not blanket obfuscation.

**Package:** `@eddy-works/never-rest` · **Licence:** Apache-2.0 · **Peer:** `neverthrow` · **Runtime deps:** none (validation via Standard Schema)

## Exports

| Module | Key exports |
| --- | --- |
| `@eddy-works/never-rest` | `RailError`, `railError`, `chain`, `flatten`, `formatChain`, `statusFor`, `toDeclaredResponse`, `disclose`, `respond` |
| `@eddy-works/never-rest/contract` | `RouteDef`, `ContractDef`, `InputOf`, `OutputOf`, `ErrorOf`, `parseInput`, `compilePath`, `matchPath` |
| `@eddy-works/never-rest/server` | `serve`, `Handler`, `Handlers`, `compileRoutes`, `matchRoute` |
| `@eddy-works/never-rest/client` | `createClient`, `Client`, `ClientOptions` |
| `@eddy-works/never-rest/node` | `toNodeHandler`, `FetchHandler`, `NodeHttpHandler` |

## The problem

Most REST libraries assume handlers throw. Middleware intercepts exceptions, typed errors get lost at the boundary, and clients branch on tuples or catch blocks instead of composing with `andThen`. Contract DSLs (`initContract()`, chained builders) inflate TypeScript instantiation cost — `@ts-rest/core` measures ~5,984 instantiations per route on a 20-route fixture. oRPC types errors on the wire but its server model is throw-based; its non-throwing `safe()` client does not compose with `map` / `andThen` / `match`. never-rest is contract-first with plain object literals, `Result`/`ResultAsync` end to end, and a published per-route type budget enforced in CI.

## Quickstart

```ts
import { ok, err } from 'neverthrow';
import { z } from 'zod';
import { railError } from '@eddy-works/never-rest';
import type { ContractDef } from '@eddy-works/never-rest/contract';
import { serve, type Handlers } from '@eddy-works/never-rest/server';
import { createClient } from '@eddy-works/never-rest/client';

const userSchema = z.object({ id: z.string(), name: z.string() });

const contract = {
  getUser: {
    method: 'GET',
    path: '/users/:id',
    input: z.object({ id: z.string() }),
    output: userSchema,
    errors: ['not_found'],
  },
  createUser: {
    method: 'POST',
    path: '/users',
    input: z.object({ name: z.string().min(1) }),
    output: userSchema,
    errors: ['conflict'],
  },
} satisfies ContractDef;

const statuses = {
  validation_error: 400,
  not_found: 404,
  conflict: 409,
  internal: 500,
} as const;

const handlers: Handlers<typeof contract, undefined> = {
  getUser: ({ input }) => ok({ id: input.id, name: 'Ada' }),
  createUser: ({ input }) => ok({ id: 'new', name: input.name }),
};

export default serve(contract, handlers, {
  statuses,
  origin: 'users-api',
  disclosure: (req) =>
    req.headers.get('x-internal') === '1' ? 'full' : 'public',
});

// Client — composes with neverthrow
const client = createClient(contract, { baseUrl: 'https://api.example.com' });

await client.getUser({ id: 'u1' });
await client.createUser({ name: 'Grace' });
```

Bring any Standard Schema validator (Zod 4, Valibot, ArkType). `serve` returns `(request, context) => Promise<Response>` on Workers, Deno, Bun, Node 18+, SvelteKit, Next. For classic Node/`http` or Express, use [`toNodeHandler`](docs/api.md#tonodehandler) from `@eddy-works/never-rest/node`.

## Examples

Mini projects share one contract and mount it on different runtimes — see [examples/README.md](examples/README.md):

| Example | Runtime |
| --- | --- |
| [express](examples/express) | Express via `./node` |
| [hono](examples/hono) | Hono |
| [next-app-router](examples/next-app-router) | Next.js App Router |
| [sveltekit](examples/sveltekit) | SvelteKit |
| [cloudflare-workers](examples/cloudflare-workers) | Cloudflare Workers |
| [gateway](examples/gateway) | Cause chains + disclosure |

```bash
pnpm build
pnpm --filter @never-rest-examples/express start
```
## Type budget

never-rest optimises for **measured TypeScript instantiations per route**, enforced in CI via `@ark/attest`. On synthetic 1–40 route fixtures against real `src` types (TypeScript 5.9.3), combined contract + client marginal slope is **~584 instantiations per route**. Published budget: **1,800 per route**. Research anchor for `@ts-rest/core`'s `c.router()` DSL: ~5,984 per route — roughly **10×** never-rest.

Methodology, reproduction, and slope breakdown: [docs/performance.md](docs/performance.md).

## When not to use this

| Alternative | Prefer it when |
| --- | --- |
| **[ts-rest](https://ts-rest.com)** | You want the `initContract()` builder, existing ecosystem adapters, or OpenAPI generation today. ts-rest is mature for contract-first REST with Zod; its DSL costs substantially more per route in instantiation benchmarks. Last stable release noted in project research: 2025-03-04. |
| **[oRPC](https://orpc.dev)** | You want RPC-style procedures, streaming, or framework integrations oRPC already ships. Server handlers use `throw errors.NOT_FOUND()`; typed errors do not compose as `Result`. The `safe()` client returns a tuple, not a composable `ResultAsync`. |
| **Throwing handlers + middleware** | Your team already standardises on exception middleware, you do not need cross-service cause chains, and graded disclosure is unnecessary. |

## Documentation

Browsable site: [congenial-adventure-r229nj4.pages.github.io](https://congenial-adventure-r229nj4.pages.github.io/) (private GitHub Pages — sign in to GitHub to view).

| Doc | Topic |
| --- | --- |
| [docs/concepts.md](docs/concepts.md) | Railway at the boundary, errors as data, trust circles |
| [docs/api.md](docs/api.md) | Every public export, signature, example |
| [docs/examples.md](docs/examples.md) | Express, Next, SvelteKit, Hono, Workers, gateway |
| [docs/errors-as-intelligence.md](docs/errors-as-intelligence.md) | `nextStep`, `origin`, `retryable`, gateway chains |
| [docs/comparison.md](docs/comparison.md) | vs ts-rest and oRPC (versions, trade-offs) |
| [docs/migrating.md](docs/migrating.md) | From ts-rest, oRPC, throwing handlers |
| [docs/performance.md](docs/performance.md) | Type instantiation budget (~584/route, CI gate) |

Agent lookup index: [skills/never-rest/SKILL.md](skills/never-rest/SKILL.md).

## Specs

28 Gherkin scenarios in `specs/` — extract with `pnpm specs:extract`. Tests map one-to-one to scenario titles:

| Spec | Tests |
| --- | --- |
| [specs/status-mapping.md](specs/status-mapping.md) | `src/status.test.ts`, `src/respond.test.ts` |
| [specs/graded-disclosure.md](specs/graded-disclosure.md) | `src/disclose.test.ts`, `src/respond.test.ts`, `src/server/serve.test.ts` |
| [specs/cause-chaining.md](specs/cause-chaining.md) | `src/error.test.ts`, `src/server/serve.test.ts` |
| [specs/client-results.md](specs/client-results.md) | `src/client/create.test.ts` |

See [specs/README.md](specs/README.md) for extraction and layout.
