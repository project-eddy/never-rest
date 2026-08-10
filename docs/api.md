---
title: API reference
description: Public exports for never-rest — errors, contract, server, and client.
---

# API reference

Subpath exports: `@eddy-works/never-rest` (errors), `./contract`, `./server`, `./client`, `./node`.

| Module | Status |
| --- | --- |
| `.` | **Shipped** |
| `./contract` | **Shipped** |
| `./server` | **Shipped** |
| `./client` | **Shipped** |
| `./node` | **Shipped** |

Types import `Result` / `ResultAsync` from `neverthrow`.

---

## `@eddy-works/never-rest` — errors and HTTP mapping

### `RailIssue`

```ts
interface RailIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
}
```

Validation or domain issue with a JSON-pointer-style path.

```ts
const issue: RailIssue = { path: ['email'], message: 'Invalid email' };
```

### `RailError` (interface)

```ts
interface RailError<TCode extends string = string> {
  readonly code: TCode;
  readonly message: string;
  readonly issues?: readonly RailIssue[];
  readonly cause?: RailError;
  readonly origin?: string;
  readonly retryable?: boolean;
  readonly nextStep?: string;
}
```

### `railError` (function)

```ts
function railError<TCode extends string>(
  code: TCode,
  message: string,
  extra?: Omit<RailError<TCode>, 'code' | 'message'>,
): RailError<TCode>;
```

```ts
railError('not_found', 'User not found', { nextStep: 'Check the id and retry' });
```

### `chain`

```ts
function chain<TCode extends string>(
  outer: Omit<RailError<TCode>, 'cause'>,
  cause: RailError,
): RailError<TCode>;
```

Wrap a downstream error as the cause of a caller-facing error.

```ts
const downstream = railError('not_found', 'Row missing', { origin: 'inventory' });
const gateway = chain(
  { code: 'order_failed', message: 'Could not fulfil order', origin: 'orders' },
  downstream,
);
```

### `flatten`

```ts
function flatten(error: RailError): readonly RailError[];
```

Root-first list of every hop in the chain.

```ts
flatten(gateway); // [gateway, downstream]
```

### `formatChain`

```ts
function formatChain(error: RailError): string;
```

One line per hop for logs.

```ts
formatChain(gateway);
// [orders] order_failed: Could not fulfil order
// [inventory] not_found: Row missing
```

When `origin` is absent, the line is `code: message` only.

### `StatusMap`

```ts
type StatusMap<TCode extends string> = { readonly [K in TCode]: number };
```

### `statusFor`

```ts
function statusFor<TCode extends string>(
  map: StatusMap<TCode>,
  error: RailError<TCode>,
): number;
```

```ts
statusFor({ not_found: 404, conflict: 409 }, railError('not_found', '…')); // 404
```

### `toDeclaredResponse`

```ts
function toDeclaredResponse<TCode extends string, TStatus extends number>(
  error: RailError<TCode>,
  map: StatusMap<TCode>,
  declared: readonly TStatus[],
): { status: TStatus | 500; body: RailError<TCode> };
```

Undeclared statuses degrade to `500`.

```ts
toDeclaredResponse(
  railError('not_found', '…'),
  { not_found: 404 },
  [200, 404],
);
// { status: 404, body: … }

toDeclaredResponse(
  railError('not_found', '…'),
  { not_found: 404 },
  [200], // 404 not declared
);
// { status: 500, body: … }
```

### `Disclosure`

```ts
type Disclosure = 'full' | 'internal' | 'public';
```

### `disclose`

```ts
function disclose<TCode extends string>(
  error: RailError<TCode>,
  level: Disclosure,
): RailError<TCode>;
```

```ts
disclose(chain(outer, cause), 'public'); // no cause, no internal issue paths
```

### `RespondOptions`

```ts
interface RespondOptions<TCode extends string, TSuccess extends number, TStatus extends number> {
  readonly success: TSuccess;
  readonly statuses: StatusMap<TCode>;
  readonly declared: readonly TStatus[];
  readonly disclosure?: Disclosure; // defaults to 'full'
}
```

### `respond`

```ts
function respond<TValue, TCode extends string, TSuccess extends number, TStatus extends number>(
  result: Result<TValue, RailError<TCode>>,
  options: RespondOptions<TCode, TSuccess, TStatus>,
): { status: TSuccess; body: TValue } | { status: TStatus | 500; body: RailError<TCode> };
```

```ts
respond(ok({ id: '1' }), {
  success: 200,
  statuses: { not_found: 404 },
  declared: [200, 404],
  disclosure: 'internal',
});
```

---

## `@eddy-works/never-rest/contract`

### `RouteDef`

```ts
interface RouteDef {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly input?: StandardSchemaV1;
  readonly output: StandardSchemaV1;
  readonly errors: readonly string[];
  readonly summary?: string;
}
```

### `ContractDef`

```ts
interface ContractDef {
  readonly [operation: string]: RouteDef;
}
```

Plain object literal — no builder.

```ts
export const contract = {
  getUser: {
    method: 'GET',
    path: '/users/:id',
    output: userSchema,
    errors: ['not_found'],
  },
} satisfies ContractDef;
```

### `InputOf`

```ts
type InputOf<TRoute extends RouteDef> =
  TRoute['input'] extends StandardSchemaV1
    ? StandardSchemaV1.InferOutput<TRoute['input']>
    : undefined;
```

### `OutputOf`

```ts
type OutputOf<TRoute extends RouteDef> = StandardSchemaV1.InferOutput<TRoute['output']>;
```

### `ErrorOf`

```ts
type ErrorOf<TRoute extends RouteDef> = RailError<TRoute['errors'][number]>;
```

### `parseInput`

```ts
function parseInput<TRoute extends RouteDef>(
  route: TRoute,
  value: unknown,
): ResultAsync<InputOf<TRoute>, RailError<'validation_error'>>;
```

```ts
await parseInput(contract.createUser, { email: 'bad' });
// Err({ code: 'validation_error', issues: [...] })

await parseInput(contract.getUser, undefined);
// Ok(undefined) — routes without input skip validation
```

Works with any Standard Schema validator (Zod 4, Valibot, ArkType). Validation never throws; rejections and thrown validators become `Err(validation_error)`.

### `CompiledPath`

```ts
interface CompiledPath {
  readonly regex: RegExp;
  readonly paramNames: readonly string[];
}
```

Precompiled matcher for a contract path string.

### `compilePath`

```ts
function compilePath(path: string): CompiledPath;
```

Compile `/users/:id` into a regex and param names. Exact segments and single `:param` segments only; invalid segments (empty `:`, multiple `:` in one segment) throw.

```ts
const compiled = compilePath('/users/:id');
// { regex: /^\/users\/([^/]+)$/, paramNames: ['id'] }
```

### `matchPath`

```ts
function matchPath(
  compiled: CompiledPath,
  pathname: string,
): Record<string, string> | undefined;
```

Match a pathname against a compiled path; return extracted params or `undefined`.

```ts
matchPath(compiled, '/users/u1'); // { id: 'u1' }
matchPath(compiled, '/orders/1'); // undefined
```

`serve` uses `compileRoutes` / `matchPath` (via `./server`), matching routes in contract declaration order.

---

## `@eddy-works/never-rest/server`

### `CompiledRoute`

```ts
interface CompiledRoute {
  readonly key: string;
  readonly route: RouteDef;
  readonly compiledPath: CompiledPath;
}
```

### `RouteMatch`

```ts
interface RouteMatch {
  readonly key: string;
  readonly route: RouteDef;
  readonly params: Record<string, string>;
}
```

### `compileRoutes`

```ts
function compileRoutes(contract: ContractDef): readonly CompiledRoute[];
```

Precompile every operation in a contract for routing.

### `matchRoute`

```ts
function matchRoute(
  routes: readonly CompiledRoute[],
  method: string,
  pathname: string,
): RouteMatch | undefined;
```

First match by method and pathname in declaration order, or `undefined`.

### `Handler`

```ts
type Handler<TRoute extends RouteDef, TContext> = (
  args: {
    input: InputOf<TRoute>;
    params: Record<string, string>;
    request: Request;
    context: TContext;
  },
) => Result<OutputOf<TRoute>, RailError<TRoute['errors'][number]>>
  | ResultAsync<OutputOf<TRoute>, RailError<TRoute['errors'][number]>>
  | Promise<Result<OutputOf<TRoute>, RailError<TRoute['errors'][number]>>>;
```

Sync `ok` / `err`, `ResultAsync`, or `Promise<Result>` are all accepted.
### `Handlers`

```ts
type Handlers<TContract extends ContractDef, TContext> = {
  readonly [K in keyof TContract]: Handler<TContract[K], TContext>;
};
```

### `ServeOptions`

```ts
interface ServeOptions<TCode extends string> {
  readonly statuses: StatusMap<TCode>;
  readonly disclosure?: Disclosure | ((request: Request) => Disclosure);
  readonly origin?: string;
}
```

### `serve`

```ts
function serve<TContract extends ContractDef, TContext>(
  contract: TContract,
  handlers: Handlers<TContract, TContext>,
  options: ServeOptions<string>,
): (request: Request, context: TContext) => Promise<Response>;
```

```ts
const handlers: Handlers<typeof contract, { requestId: string }> = {
  getUser: ({ params }) => ok({ id: params.id, name: 'Ada' }),
  createUser: ({ input }) => ok({ id: 'new', name: input.name }),
};

const handler = serve(contract, handlers, {
  statuses: {
    validation_error: 400,
    not_found: 404,
    conflict: 409,
    internal: 500,
  },
  origin: 'users-api',
  disclosure: (req) =>
    req.headers.get('x-internal') === '1' ? 'full' : 'public',
});

await handler(new Request('http://localhost/users/u1'), { requestId: 'r1' });
```

**Routing:** exact paths and single `:param` segments, declaration order. Unmatched requests → `not_found` at `statuses.not_found`.

**Input:** `GET` / `DELETE` read query params; `POST` / `PUT` / `PATCH` read JSON body (invalid JSON → `validation_error`). Path `:param` values are merged into that input before `parseInput`, so a client-shaped `input: z.object({ id: z.string() })` validates against `/users/:id`.

**Declared statuses** per route: `200`, each route error code, `validation_error` when the route has `input`, and `internal`. Undeclared mapped statuses degrade to `500`.

**Origin:** `options.origin` stamps errors when absent (recursive on `cause`). Existing `origin` on an error is preserved.

**Throws:** handler exceptions become `internal` 500 with the message under `cause` — never an unhandled rejection.

**Tests:** `src/server/serve.test.ts` — scenarios from [specs/cause-chaining.md](https://github.com/project-eddy/never-rest/blob/main/specs/cause-chaining.md) and [specs/graded-disclosure.md](https://github.com/project-eddy/never-rest/blob/main/specs/graded-disclosure.md).

---

## `@eddy-works/never-rest/client`

### `ClientOptions`

```ts
interface ClientOptions {
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
  readonly headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  readonly credentials?: RequestCredentials;
}
```

When `credentials` is omitted, the underlying `fetch` implementation's default applies (typically `same-origin` in browsers).

### `Client`

```ts
type Client<TContract extends ContractDef> = {
  readonly [K in keyof TContract]: (
    input: InputOf<TContract[K]>,
  ) => ResultAsync<OutputOf<TContract[K]>, ErrorOf<TContract[K]>>;
};
```

One mapped type over the contract, one level deep — no recursion.

### `createClient`

```ts
function createClient<TContract extends ContractDef>(
  contract: TContract,
  options: ClientOptions,
): Client<TContract>;
```

```ts
const client = createClient(contract, {
  baseUrl: 'https://api.example.com',
  fetch: customFetch, // optional
});

await client
  .getUser({ id: 'u1' })
  .andThen((user) => client.loadOrders({ userId: user.id }))
  .map((orders) => orders.orders.length);
```

**Behaviour:** validates input via `parseInput`; path `:param` keys are taken from input, remainder sent as JSON body (`POST`/`PUT`/`PATCH`) or query string (`GET`/`DELETE`). 2xx → `Ok` (output schema); JSON `RailError` with a declared code → `Err`; undeclared error code → `Err(internal)`; non-JSON body → `Err(internal)`; network failure → `Err(unavailable, { retryable: true })`. Never throws.

**Tests:** `src/client/create.test.ts` — scenarios from [specs/client-results.md](https://github.com/project-eddy/never-rest/blob/main/specs/client-results.md).

---

## `@eddy-works/never-rest/node`

Thin Node `http` / Express bridge. Not middleware, auth, or a framework adapter suite — only `Request`/`Response` ↔ `IncomingMessage`/`ServerResponse`.

### `FetchHandler`

```ts
type FetchHandler = (request: Request) => Response | Promise<Response>;
```

### `NodeHttpHandler`

```ts
type NodeHttpHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void>;
```

### `toNodeHandler`

```ts
function toNodeHandler(handler: FetchHandler): NodeHttpHandler;
```

```ts
import { createServer } from 'node:http';
import { serve } from '@eddy-works/never-rest/server';
import { toNodeHandler } from '@eddy-works/never-rest/node';

const handler = serve(contract, handlers, { statuses, origin: 'users-api' });
createServer(toNodeHandler((request) => handler(request, undefined))).listen(3000);

// Express
app.use(toNodeHandler((request) => handler(request, undefined)));
```

Close over `serve` context when needed: `toNodeHandler((req) => handler(req, ctx))`.

**Tests:** `src/node/to-node-handler.test.ts`.
