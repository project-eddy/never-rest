---
title: Migrating
description: Move from ts-rest, oRPC, or throwing handlers to never-rest Result contracts.
---

# Migrating

## Upgrading from 0.4.x

### Migration table

| 0.4.x | 0.5 |
| --- | --- |
| `RouteDef.input` | `params?`, `query?`, `body?` (each optional Standard Schema) |
| `RouteDef.errors: ['not_found']` | `errors: { not_found: 404 }` — code → status map per route; use `{}` when a route declares no domain errors |
| `ServeOptions.statuses` / `ServeStatusMap` | removed — domain statuses live on `RouteDef.errors`; host codes (`validation_error`, `internal`, `route_not_found`) use `HOST_STATUSES` / `hostStatuses` |
| `RouteDef.output` (required) | `output?` — omit when `success: 204`; handler returns `Result<void, …>` |
| `success` (implicit 200) | `success?: 200 \| 201 \| 202 \| 204` per route |
| `headers` | optional Standard Schema; client `args.headers`, handler `args.headers` |
| Prefix strip / `isContractPath` pre-gate | `serve(..., { basePath })` and cooperative `handler.handle(request, ctx)` |
| `ClientInputOf<Route>` | `ClientArgsOf<Route>` — nested `{ params?, query?, body?, headers? }` (`InferInput` per source) |
| `HandlerInputOf<Route>` / `InputOf` | `HandlerArgsOf<Route>` — nested `{ params?, query?, body?, headers? }` (`InferOutput` per source) |
| `parseInput(route, value)` | `parseRouteSources(route, { params?, query?, body? })` |
| `client.getUser({ id })` | `client.getUser({ params: { id } })` |
| `client.createUser({ name })` | `client.createUser({ body: { name } })` |
| `client.listUsers()` (no input) | unchanged — routes with no sources take no args |
| Handler `{ input, params, request, context }` | `HandlerArgsOf & { request, context }` — typed `params` / `query` / `body` / `headers` from schemas |
| Path `:id` merged into flat `input` | `params` schema required when path has `:param` segments |
| POST body only | POST may declare `query` and `body` together |

### Contract — split `input` into sources

```ts
// Before (0.4.x)
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
  input: z.object({ name: z.string() }),
  output: userSchema,
  errors: ['conflict'],
},

// After (0.5)
getUser: {
  method: 'GET',
  path: '/users/:id',
  params: z.object({ id: z.string() }),
  output: userSchema,
  errors: { not_found: 404 },
},
createUser: {
  method: 'POST',
  path: '/users',
  body: z.object({ name: z.string() }),
  output: userSchema,
  success: 201,
  errors: { conflict: 409 },
},
deleteUser: {
  method: 'DELETE',
  path: '/users/:id',
  params: z.object({ id: z.string() }),
  success: 204,
  errors: { not_found: 404 },
},
```

Path parameters live in `params`; query fields in `query`; JSON body fields in `body`; request headers in `headers`. A field named `id` in both `params` and `body` stays distinct — they are never merged.

`compileContract` now rejects:

- a path with `:param` segments without a `params` schema
- `params` on a static path (no `:param` segments)
- `body` on GET or DELETE

Query is allowed on every method, including POST alongside `body`.

### Handlers and clients

```ts
// Before
getUser: ({ input }) => findUser(input.id),
createUser: ({ input }) => reserveId(input.name),

await client.getUser({ id: 'ada' });
await client.createUser({ name: 'Ada' });

// After
getUser: ({ params }) => findUser(params.id),
createUser: ({ body }) => reserveId(body.name),

await client.getUser({ params: { id: 'ada' } });
await client.createUser({ body: { name: 'Ada' } });
```

### Status map relocation

Move domain codes from `serve(..., { statuses })` onto each route's `errors` map. Do **not** put host codes on routes — `validation_error`, `internal`, and `route_not_found` are host defaults (`HOST_STATUSES`), overridable via `serve(..., { hostStatuses })`.

```ts
// Before (0.4.x)
const statuses = {
  validation_error: 400,
  not_found: 404,
  conflict: 409,
  route_not_found: 404,
  internal: 500,
} as const;

export default serve(contract, handlers, { statuses, origin: 'my-api' });

// After (0.5)
const contract = {
  getUser: { /* … */ errors: { not_found: 404 } },
  createUser: { /* … */ errors: { conflict: 409 } },
  listUsers: { /* … */ errors: {} },
} as const satisfies ContractDef;

export default serve(contract, handlers, { origin: 'my-api' });
```

`respond` and `toDeclaredResponse` still accept a plain status map when you build a custom adapter — derive it from the matched route's `errors` plus host statuses.

### Mount changes — `basePath` and `handle()`

Callable `serve()` still answers every request (including `route_not_found`). Shared-process hosts use cooperative mounting instead of hand-rolled prefix stripping or `isContractPath` pre-gates.

```ts
// Next — mount under /api without rewriting Request URLs
const usersApi = serve(contract, handlers, { basePath: '/api', origin: 'next-demo' });

function handle(request: Request) {
  return usersApi(request, undefined);
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };

// SvelteKit — only contract paths reach never-rest
export const handle: Handle = async ({ event, resolve }) => {
  const result = await usersApi.handle(event.request, undefined);
  if (result.matched) {
    return result.response;
  }
  return resolve(event);
};
```

`handle()` returns `{ matched: false }` only when the path is outside `basePath` or outside the compiled contract paths. A known path with an unknown method stays `matched: true` with a `route_not_found` response. That unmatched branch is where SSE, multipart uploads, and other non-JSON handlers belong — not a prefix heuristic. See [files and streams](./files-and-streams.md).

Replace `parseInput` with `parseRouteSources` when validating sources manually:

```ts
await parseRouteSources(route, { params: rawParams, query: rawQuery, body: rawBody });
```

---

## Upgrading from 0.4.0

### Shared-process mounting

`serve()` always returns a `Response`, including JSON `route_not_found` for unmatched paths when called directly. Hosts that share a fetch pipeline with pages or another router (SvelteKit hooks, Next catch-alls) should use `basePath` and cooperative `handler.handle()` — see [Mount changes — `basePath` and `handle()`](#mount-changes--basepath-and-handle) above.

### Contract-wide transport checks

Prefer `checkContractOutputs(contract, samples)` over calling `checkTransportStability` per schema. Omitting an operation is a type error.

### Unexpected handler faults

Do not return `railError('internal', …)` from a handler — that message is stripped at `public` disclosure. Throw, or map to a **declared** domain code. `serve()` catches throws and returns wire `internal`.

---

## Upgrading from 0.3.0

### Contract style — `as const`

Use `as const satisfies ContractDef` on every contract. Without `as const`, `errors` widens and TypeScript will not catch missing domain codes on routes.

```ts
const contract = {
  getUser: { /* … */ errors: { not_found: 404 } },
} as const satisfies ContractDef;
```

### Input type split (0.4.0)

`InputOf` was deprecated in 0.4.0 — it aliased the **handler** side (`InferOutput`). In 0.5 the split types are `ClientArgsOf` and `HandlerArgsOf` with nested `params` / `query` / `body` keys. See [Upgrading from 0.4.x](#upgrading-from-04x).

Previously (0.4.0):

| Type | Meaning |
| --- | --- |
| `ClientInputOf<Route>` | What callers passed to `createClient` (`InferInput` — wire-shaped) |
| `HandlerInputOf<Route>` | What handlers received after server parsing (`InferOutput` — coerced/transformed) |

A route with `z.string().transform(Number)` on query typed as `{ limit: string }` on the client and `{ limit: number }` in the handler. The client validated raw input; the server applied transforms per source after path/query/body parse.

### Path decoding and `matchPath`

Path captures are percent-decoded before they reach handlers (`hello%20world` → `hello world`). `matchPath` now returns a `PathMatch` discriminated union — `{ kind: 'match', params }`, `{ kind: 'miss' }`, or `{ kind: 'invalid_encoding', param }` — instead of `Record<string, string> | undefined`. Malformed percent sequences become `validation_error` on the server, not a thrown `URIError`.

Empty or missing path parameters are rejected as `validation_error` before fetch on the client.

### Query encoding

GET/DELETE query fields serialize predictably:

- Primitives and dates as scalar `key=value`
- Arrays of primitives (or dates) as `key[]=a&key[]=b` — including single-element arrays
- `undefined` / `null` omitted; empty arrays, nested objects, `bigint`, and nested arrays → `validation_error` before fetch

The server reads `k[]` keys back into arrays.

### Forged and reserved error codes

Handler `Err` values whose `code` is not on the route's `errors` array — including forged `internal`, `validation_error`, and `route_not_found` — are normalised to wire `internal` with the original error under `cause`. At default `public` disclosure the top-level message is a constant; diagnostics are visible at `full` disclosure only.

Do not `mapErr` into `internal` inside handler pipelines expecting that message on the public wire — use a **declared domain code** instead (see [railway-patterns.md — Translate](./railway-patterns.md#translate-maperr)). Unexpected faults with no domain code should throw; `serve()` catches them. The client mirrors this: unknown remote codes become `internal` with a constant message and the remote error preserved as `cause`.

### Output schemas — transport stability

Output validation parses handler output, serialises the parsed value, and the client re-parses the JSON with the same schema. Schemas whose transforms change the wire shape (for example `z.number().transform(String)`) fail on the client after a successful server response. Output schemas must be **transport-stable**: parse → `JSON.stringify` → `JSON.parse` → parse again must yield an equal value.

Prove compliance in tests with `checkContractOutputs` (every operation) or `checkTransportStability` (one schema) from `@eddy-works/never-rest/testing`:

```ts
import { checkContractOutputs } from '@eddy-works/never-rest/testing';

await checkContractOutputs(contract, {
  getUser: { id: 'u1', name: 'Ada' },
  listUsers: [{ id: 'u1', name: 'Ada' }],
});
```

### Construction-time validation

`compileContract` now rejects trailing-slash aliases (`/users` vs `/users/`), duplicate compiled matchers (`/users/:id` and `/users/:userId`), duplicate path parameter names within a route, and incomplete handler maps (`assertHandlersComplete`). Both `serve` and `createClient` use the compiled representation — paths are not recompiled per request.

---

## Upgrading from 0.2.0

### Client error type

`createClient` operations now return `ResultAsync<Output, ClientErrorOf<Route>>` — domain codes plus `validation_error`, `internal`, and `unavailable`. Branch on the full union; do not assume only domain codes from `ErrorOf`.

### Server status map (0.3 → 0.4)

In 0.4, add `route_not_found` to every `serve` status map. Remove `unavailable` from server maps — the client synthesises it on network failure. In **0.5**, `ServeOptions.statuses` is removed — put domain codes on `RouteDef.errors` instead (see [Status map relocation](#status-map-relocation)).

### Output validation

Remove `validateOutput: true` (or `false`) from `serve` options — the option is gone. Output validation is always on, and the **parsed** schema value is what gets serialised. If you relied on returning extra fields the schema does not declare, strip them in the handler or widen the output schema.

### Disclosure default

Omitted `disclosure` in `serve()` now defaults to `public`. Pass `disclosure: 'full'` or a per-request function when internal callers need cause chains. `respond` still defaults to `full`.

### Unmatched routes

404s from routing use `route_not_found`, not domain `not_found`. Update clients and logs that distinguished "no such route" from "resource missing".

### Undeclared handler errors

Returning `err(railError('typo_code', …))` when `typo_code` is not on the route's `errors` array now becomes wire `internal` with your error nested under `cause`.

### Construction-time validation

`serve` and `createClient` call `compileContract` at construction. Reserved codes (`validation_error`, `internal`, `unavailable`, `route_not_found`) cannot appear as domain codes; duplicate `method+path` pairs throw `ContractConfigurationError`.

---

## From ts-rest

### Contract

Replace `initContract()` chains with a plain object and `satisfies ContractDef`:

```ts
// Before (ts-rest)
const c = initContract();
const contract = c.router({
  getUser: {
    method: 'GET',
    path: '/users/:id',
    responses: { 200: userSchema, 404: z.object({ message: z.string() }) },
  },
});

// After (never-rest)
import type { ContractDef } from '@eddy-works/never-rest/contract';

const contract = {
  getUser: {
    method: 'GET',
    path: '/users/:id',
    output: userSchema,
    errors: { not_found: 404 },
  },
} as const satisfies ContractDef;
```

Declare error **codes and statuses** on each route's `errors` map. Host codes stay on `HOST_STATUSES` / `hostStatuses`, not on routes. Use `as const satisfies ContractDef` so domain codes stay literal.

### Handlers

Return `Result` instead of throwing or returning raw values:

```ts
// Before — throw or implicit success
async function getUser({ params }) {
  const user = await db.user.find(params.id);
  if (!user) throw new NotFoundError();
  return { status: 200, body: user };
}

// After
import { ok, err } from 'neverthrow';
import { railError } from '@eddy-works/never-rest';

function getUser({ params }) {
  const user = db.user.find(params.id);
  if (!user) return err(railError('not_found', 'User not found'));
  return ok(user);
}
```

### Middleware

Drop the interceptor stack. Auth, side effects, and after-effects become ordinary composition inside the handler:

```ts
getInvoice: ({ params, request }) =>
  requireAuth(request)
    .andThen((session) => requireRole(session, 'billing'))
    .andTee((session) => metrics.increment('invoice.auth_ok'))
    .andThen((session) => loadInvoiceFor(session, params.id))
    .andTee((invoice) => audit.read('invoice', invoice.id)),
```

See [concepts.md — No middleware](./concepts.md#no-middleware--the-chain-is-the-middleware) and the full catalogue in [railway-patterns.md](./railway-patterns.md). For capability types and `withAuth` composers that make auth non-omittable at registration, see [advanced-usage.md](./advanced-usage.md).

### Client

Replace ts-rest client with `createClient`. Branch on `Result` instead of try/catch:

```ts
const result = await client.getUser({ params: { id } });
return result.match(
  (user) => render(user),
  (error) => renderError(error),
);
```

### Type performance

Expect lower instantiations per route after dropping `c.router()` — verify with `pnpm perf:check`.

---

## From oRPC

### Server — throws to Result

```ts
// Before (oRPC server)
throw errors.NOT_FOUND({ message: 'User not found' });

// After
return err(railError('not_found', 'User not found'));
```

Typed errors remain on the `errors` array of each `RouteDef`; they are not exception types.

### Client — safe() tuple to ResultAsync

```ts
// Before (oRPC)
const [error, data] = await client.getUser.safe({ id });
if (error) { /* branch */ }

// After
await client.getUser({ params: { id } }).andThen((user) => /* ... */);
```

### RPC vs REST contract

oRPC procedures map cleanly to named operations in `ContractDef`, but paths and HTTP methods are explicit in never-rest. One operation = one route definition with `method` and `path`.

### Disclosure

Move sensitive error fields out of ad-hoc `data` bags; use `cause` for downstream errors and `disclose(level)` at the edge instead of manual deletion.

---

## From throwing handlers

### Step 1 — classify failures

List every `throw` in handlers. Each becomes a declared error code or `validation_error` / `internal`. Middleware that only existed to catch those throws becomes `andThen` gates in the handler — see [concepts.md — No middleware](./concepts.md#no-middleware--the-chain-is-the-middleware).

### Step 2 — map codes to statuses on each route

```ts
const contract = {
  getUser: { /* … */ errors: { not_found: 404 } },
  createUser: { /* … */ errors: { conflict: 409, unauthorized: 401 } },
} as const satisfies ContractDef;
```

Host codes (`validation_error`, `internal`, `route_not_found`) are not listed on routes.

### Step 3 — wire with `serve`

`serve` wires per-source validation (`parseRouteSources`), handler `Result`, `respond`, JSON serialisation, and per-request disclosure. Handlers stay free of `Response` construction:

```ts
import { serve, type Handlers } from '@eddy-works/never-rest/server';

export default serve(contract, handlers, {
  origin: 'my-api',
  disclosure: 'public',
});
```

Use `respond` directly when building a custom adapter.

### Step 4 — client symmetry

Ensure the client also never throws — network and parse failures are `Err`, not exceptions. Agents and UI layers get one railway.

### Step 5 — cross-service chains

When calling another never-rest service from a handler, parse the JSON error body and `chain` it into your domain error before returning `err(...)`. Stamp `origin` on each service's `serve` options.

See [errors-as-intelligence.md](./errors-as-intelligence.md) and `specs/cause-chaining.spec.md`.
