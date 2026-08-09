# Migrating

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
    errors: ['not_found'],
  },
} satisfies ContractDef;
```

Declare error **codes** on the route; HTTP statuses live in a shared `StatusMap` passed to `serve` and `respond`, not in nested response objects per status.

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

Replace interceptors with `andThen` in the handler or a wrapper function that returns `ResultAsync`.

### Client

Replace ts-rest client with `createClient`. Branch on `Result` instead of try/catch:

```ts
const result = await client.getUser({ id });
return result.match(
  (user) => render(user),
  (error) => renderError(error),
);
```

### Type performance

Expect lower instantiations per route after dropping `c.router()` — verify with `pnpm perf:check` once slice 06 lands.

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
await client.getUser({ id }).andThen((user) => /* ... */);
```

### RPC vs REST contract

oRPC procedures map cleanly to named operations in `ContractDef`, but paths and HTTP methods are explicit in never-rest. One operation = one route definition with `method` and `path`.

### Disclosure

Move sensitive error fields out of ad-hoc `data` bags; use `cause` for downstream errors and `disclose(level)` at the edge instead of manual deletion.

---

## From throwing handlers

### Step 1 — classify failures

List every `throw` in handlers. Each becomes a declared error code or `validation_error` / `internal`.

### Step 2 — centralise status mapping

```ts
const statuses = {
  not_found: 404,
  validation_error: 400,
  conflict: 409,
  unauthorized: 401,
  internal: 500,
} as const;
```

### Step 3 — wire with `serve`

`serve` wires validation (`parseInput`), handler `Result`, `respond`, JSON serialisation, and per-request disclosure. Handlers stay free of `Response` construction:

```ts
import { serve, type Handlers } from '@eddy-works/never-rest/server';

export default serve(contract, handlers, {
  statuses,
  origin: 'my-api',
  disclosure: 'public',
});
```

Use `respond` directly when building a custom adapter.

### Step 4 — client symmetry

Ensure the client also never throws — network and parse failures are `Err`, not exceptions. Agents and UI layers get one railway.

### Step 5 — cross-service chains

When calling another never-rest service from a handler, parse the JSON error body and `chain` it into your domain error before returning `err(...)`. Stamp `origin` on each service's `serve` options.

See [errors-as-intelligence.md](errors-as-intelligence.md) and `specs/cause-chaining.md`.
