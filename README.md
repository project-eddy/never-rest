# never-rest

[![npm version](https://img.shields.io/npm/v/@eddy-works/never-rest.svg?color=cb3837&label=npm)](https://www.npmjs.com/package/@eddy-works/never-rest)
[![CI](https://github.com/project-eddy/never-rest/actions/workflows/ci.yml/badge.svg)](https://github.com/project-eddy/never-rest/actions/workflows/ci.yml)
[![types included](https://img.shields.io/badge/types-included-3178c6.svg?logo=typescript&logoColor=white)](https://www.npmjs.com/package/@eddy-works/never-rest)
[![license](https://img.shields.io/npm/l/@eddy-works/never-rest.svg?color=blue)](LICENSE)
[![node](https://img.shields.io/node/v/@eddy-works/never-rest.svg)](package.json)

**An opinionated architectural choice** — never-rest puts Result-based railway-oriented programming at the API boundary. Whether either side uses railway style internally is up to that team and does not matter to the contract. The assumption is that at least one side wants it; otherwise there is no reason to reach for this.

On top of that choice: HTTP contracts where handlers return `Result` instead of throwing, errors carry their cause chain across service boundaries, and disclosure is graded by caller trust — not blanket obfuscation.

**Package:** `@eddy-works/never-rest` · **Licence:** Apache-2.0 · **Peer:** `neverthrow` · **Runtime deps:** none (validation via Standard Schema)

## Install

```bash
npm i @eddy-works/never-rest neverthrow
```

```bash
pnpm add @eddy-works/never-rest neverthrow
```

`neverthrow` is a peer dependency — it's the `Result` / `ResultAsync` implementation never-rest builds on.

## Exports

| Module | Key exports |
| --- | --- |
| `@eddy-works/never-rest` | `RailError`, `railError`, `chain`, `flatten`, `formatChain`, `statusFor`, `toDeclaredResponse`, `disclose`, `respond` |
| `@eddy-works/never-rest/contract` | `RouteDef`, `ContractDef`, `ClientInputOf`, `HandlerInputOf`, `InputOf` (deprecated), `OutputOf`, `ErrorOf`, `ClientErrorOf`, `ServerErrorOf`, `parseInput`, `parseOutput`, `compileContract`, `isContractPath`, `compilePath`, `matchPath`, `normalizePath`, `assertHandlersComplete`, `ContractConfigurationError` |
| `@eddy-works/never-rest/server` | `serve`, `Handler`, `Handlers`, `compileRoutes`, `matchRoute` |
| `@eddy-works/never-rest/client` | `createClient`, `Client`, `ClientOptions` |
| `@eddy-works/never-rest/node` | `toNodeHandler`, `FetchHandler`, `NodeHttpHandler` |
| `@eddy-works/never-rest/testing` | `checkTransportStability`, `checkContractOutputs` |

## The problem

Most REST libraries assume handlers throw. Middleware intercepts exceptions, typed errors get lost at the boundary, and clients branch on tuples or catch blocks instead of composing with `andThen`. Contract DSLs (`initContract()`, chained builders) inflate TypeScript instantiation cost — `@ts-rest/core` measures ~5,984 instantiations per route on a 20-route fixture. oRPC types errors on the wire but its server model is throw-based; its non-throwing `safe()` client does not compose with `map` / `andThen` / `match`. never-rest is contract-first with plain object literals, `Result`/`ResultAsync` end to end, and a published per-route type budget enforced in CI.

## No middleware

When handlers return `Result`, auth, side effects, and after-effects are just functions in the chain — not a separate interceptor stack:

```ts
getInvoice: ({ input, request }) =>
  requireAuth(request) // gate
    .andThen((session) => requireRole(session, 'billing'))
    .andTee((session) => metrics.increment('invoice.auth_ok')) // side effect
    .andThen((session) => loadInvoiceFor(session.userId, input.id))
    .andTee((invoice) => audit.read('invoice', invoice.id)), // after-effect (best-effort)
```

If auth fails, the domain call never runs. Tee effects observe without inventing new failure modes; use `andThen` when a follow-up must succeed. Full catalogue (router, recover, fan-out, lift, …) with neverthrow and ROP links: [docs/railway-patterns.md](docs/railway-patterns.md). Thesis: [docs/concepts.md — No middleware](docs/concepts.md#no-middleware--the-chain-is-the-middleware).

## Quickstart

Handlers return a neverthrow `Result` — never throw. Compose with `map` / `andThen` on the server; the client is the same `ResultAsync` shape.

```ts
import { ok, err, type Result } from 'neverthrow';
import { z } from 'zod';
import { railError, type RailError } from '@eddy-works/never-rest';
import type { ContractDef } from '@eddy-works/never-rest/contract';
import { serve, type Handlers } from '@eddy-works/never-rest/server';
import { createClient } from '@eddy-works/never-rest/client';

const userSchema = z.object({ id: z.string(), name: z.string() });
type User = z.infer<typeof userSchema>;

// Plumbing — declare routes, schemas, and status map.
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
} as const satisfies ContractDef;

const statuses = {
  validation_error: 400,
  not_found: 404,
  conflict: 409,
  route_not_found: 404,
  internal: 500,
} as const;

// Business logic — compose with `map` / `andThen` the same way as the client.
const users = new Map<string, User>([['ada', { id: 'ada', name: 'Ada' }]]);

function findUser(id: string): Result<User, RailError<'not_found'>> {
  const user = users.get(id);
  if (user === undefined) {
    return err(railError('not_found', `User ${id} not found`));
  }
  return ok(user);
}

function reserveId(name: string): Result<string, RailError<'conflict'>> {
  const id = name.toLowerCase();
  if (users.has(id)) {
    return err(railError('conflict', `User ${id} already exists`));
  }
  return ok(id);
}

const handlers: Handlers<typeof contract, undefined> = {
  getUser: ({ input }): Result<User, RailError<'not_found'>> =>
    findUser(input.id).map((user) => ({ ...user, name: user.name.trim() })),
  createUser: ({ input }): Result<User, RailError<'conflict'>> =>
    reserveId(input.name).map((id) => {
      const user = { id, name: input.name };
      users.set(id, user);
      return user;
    }),
};

// Plumbing — mount the contract; disclosure grades what callers see.
export default serve(contract, handlers, {
  statuses,
  origin: 'users-api',
  disclosure: (req) =>
    req.headers.get('x-internal') === '1' ? 'full' : 'public',
});

const client = createClient(contract, { baseUrl: 'https://api.example.com' });

await client
  .getUser({ id: 'ada' })
  .andThen((user) => client.createUser({ name: `${user.name} Jr` }))
  .match(
    (user) => console.log(user.id),
    (error) => console.error(error.code), // not_found | conflict | validation_error | internal | unavailable
  );
```

Bring any Standard Schema validator (Zod 4, Valibot, ArkType). Use `as const satisfies ContractDef` on every contract — without `as const`, `errors` widens to `string` and `ServeStatusMap` stops checking that your status map covers every domain code. `serve` returns `(request, context) => Promise<Response>` on Workers, Deno, Bun, Node 18+, SvelteKit, Next. For classic Node/`http` or Express, use [`toNodeHandler`](docs/api.md#tonodehandler) from `@eddy-works/never-rest/node`.

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
| [validators](examples/validators) | Zod / Valibot / ArkType |

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

Browsable site: [project-eddy.github.io/never-rest](https://project-eddy.github.io/never-rest/).

| Doc | Topic |
| --- | --- |
| [docs/concepts.md](docs/concepts.md) | Railway at the boundary, no middleware, errors as data, trust circles |
| [docs/railway-patterns.md](docs/railway-patterns.md) | Full railway/neverthrow pattern catalogue + white-label tenant kitchen sink |
| [docs/advanced-usage.md](docs/advanced-usage.md) | Policy without middleware — capabilities, composers, host wraps, agents |
| [docs/api.md](docs/api.md) | Every public export, signature, example |
| [docs/examples.md](docs/examples.md) | Express, Next, SvelteKit, Hono, Workers, gateway |
| [docs/errors-as-intelligence.md](docs/errors-as-intelligence.md) | `nextStep`, `origin`, `retryable`, gateway chains |
| [docs/comparison.md](docs/comparison.md) | vs ts-rest, oRPC, tRPC, and Hono RPC |
| [docs/migrating.md](docs/migrating.md) | From ts-rest, oRPC, throwing handlers |
| [docs/performance.md](docs/performance.md) | Type instantiation budget (~584/route, CI gate) |

Agent lookup index: [skills/never-rest/SKILL.md](skills/never-rest/SKILL.md).

## Specs

38+ Gherkin scenarios in `specs/` (63 across seven files) — extract with `pnpm specs:extract`. Tests map one-to-one to scenario titles:

| Spec | Tests |
| --- | --- |
| [specs/status-mapping.spec.md](specs/status-mapping.spec.md) | `src/status.test.ts`, `src/respond.test.ts`, `src/server/serve.test.ts` |
| [specs/graded-disclosure.spec.md](specs/graded-disclosure.spec.md) | `src/disclose.test.ts`, `src/respond.test.ts`, `src/server/serve.test.ts` |
| [specs/cause-chaining.spec.md](specs/cause-chaining.spec.md) | `src/error.test.ts`, `src/server/serve.test.ts` |
| [specs/client-results.spec.md](specs/client-results.spec.md) | `src/client/create.test.ts` |
| [specs/server-output-validation.spec.md](specs/server-output-validation.spec.md) | `src/server/serve.test.ts` |
| [specs/contract-compilation.spec.md](specs/contract-compilation.spec.md) | `src/contract/compile.test.ts`, `src/contract/path.test.ts`, `src/server/serve.test.ts` |
| [specs/wire-serialization.spec.md](specs/wire-serialization.spec.md) | `src/client/create.test.ts`, `src/client/request.ts` paths |

See [specs/README.md](specs/README.md) for extraction and layout.
