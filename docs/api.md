---
title: API reference
description: Public exports for never-rest — errors, contract, server, and client.
---

# API reference

Subpath exports: `@eddy-works/never-rest` (errors), `./contract`, `./server`, `./client`, `./node`, `./testing`, `./openapi`, `./query`.

| Module | Status |
| --- | --- |
| `.` | **Shipped** |
| `./contract` | **Shipped** |
| `./server` | **Shipped** |
| `./client` | **Shipped** |
| `./node` | **Shipped** |
| `./testing` | **Shipped** (test-time helpers; not for production handlers) |
| `./openapi` | **Shipped** |
| `./query` | **Shipped** (cache-layer adapters; no React/TanStack dependency) |

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

### `HostStatuses`

```ts
interface HostStatuses {
  readonly validation_error: number;
  readonly internal: number;
  readonly route_not_found: number;
}

const HOST_STATUSES: HostStatuses = {
  validation_error: 400,
  internal: 500,
  route_not_found: 404,
};
```

Host codes stay off `RouteDef.errors`. Override defaults with `serve(..., { hostStatuses })`.

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
  readonly params?: StandardSchemaV1;
  readonly query?: StandardSchemaV1;
  readonly body?: StandardSchemaV1;
  readonly headers?: StandardSchemaV1;
  readonly output?: StandardSchemaV1; // omit only when success is 204
  readonly success?: number; // 200 | 201 | 202 | 204; default 200
  readonly errors: { readonly [code: string]: number };
  readonly summary?: string;
}
```

Each input source is optional. Declare `params` when the path has `:param` segments; declare `query` for query-string fields; declare `body` for JSON body fields on POST, PUT, and PATCH; declare `headers` for request-header fields. GET and DELETE may use `params`, `query`, and `headers` but not `body`. POST may combine `query` and `body`. Fields that share a name across sources stay distinct — `params.id` and `body.id` never merge.

`errors` is a code → HTTP-status map (`{ not_found: 404 }`). Use `{}` when the route declares no domain errors. Host codes (`validation_error`, `internal`, `route_not_found`) must not appear here. The same domain code may map to different statuses on different routes. `output` is required unless `success` is `204`.

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
    params: z.object({ id: z.string() }),
    output: userSchema,
    errors: { not_found: 404 },
  },
} as const satisfies ContractDef;
```

Use `as const satisfies ContractDef` so error-code keys stay literal. Without `as const`, `errors` widens and domain codes stop being literal. Keep the object in its own module (or shared package) and import it from handlers, `serve`, and clients — see the [gateway example](../examples/gateway).

### `compileContract`

```ts
function compileContract<TContract extends ContractDef>(
  contract: TContract,
): CompiledContract<TContract>;
```

Validates the contract once at `serve` / `createClient` / `toOpenAPI` construction. Rejects duplicate literal paths, trailing-slash aliases, duplicate compiled matchers (for example `/users/:id` and `/users/:userId`), duplicate path parameter names within a route, a path with `:param` segments without a `params` schema, `params` on a static path, `body` on GET or DELETE, reserved domain error codes, host codes on `route.errors`, error statuses outside 400–599, success codes other than 200/201/202/204, `output` on 204 routes, missing `output` on other success codes, and duplicate error codes within a route. Throws `ContractConfigurationError` naming the conflicting operations.

### `isContractPath`

```ts
function isContractPath(
  compiled: CompiledContract<ContractDef>,
  pathname: string,
): boolean;
```

True when `pathname` matches any compiled route, regardless of method. Uses compiled `matchPath` matchers — not a `Set` of template strings — so `/users/:id` matches `/users/ada`. Malformed percent-encoding (`invalid_encoding`) still counts as a match so the host dispatches to `serve`, which returns `validation_error`.

Prefer cooperative [`handle()`](#servehandler) for shared-process mounts (SvelteKit `hooks.server.ts`, Workers). Callable `serve()` always returns a `Response`, including JSON `route_not_found` for unmatched paths, so calling it for every request would steal non-contract traffic. `handle()` returns `{ matched: false }` only outside `basePath` or the contract path set — wrong method on a known path stays `{ matched: true }` with `route_not_found`. Sibling uploads and SSE belong on that unmatched path — [files and streams](./files-and-streams.md).

`isContractPath` remains for hosts that must decide membership without invoking `serve`.

```ts
import { serve } from '@eddy-works/never-rest/server';

const handler = serve(contract, handlers, { origin: 'users-api', basePath: '/api' });

const result = await handler.handle(request, context);
if (result.matched) {
  return result.response;
}
```

### `ContractConfigurationError`

Thrown when `compileContract` finds an invalid contract. Fix the contract before construction proceeds.

### `assertHandlersComplete`

```ts
function assertHandlersComplete<TContract extends ContractDef>(
  contract: TContract,
  handlers: Record<string, unknown>,
): asserts handlers is Handlers<TContract, unknown>;
```

Ensures every operation key in the contract maps to a function handler. Called by `serve` at construction.

### `ClientArgsOf`

```ts
type ClientArgsOf<TRoute extends RouteDef> = {
  readonly params?: …;   // when route declares params — InferInput
  readonly query?: …;    // when route declares query — InferInput
  readonly body?: …;     // when route declares body — InferInput
  readonly headers?: …;  // when route declares headers — InferInput
};
```

Wire-shaped client args from declared `params`, `query`, `body`, and `headers` schemas. Each key appears only when the route declares that source. Use `InferInput` so transforms and coerces type correctly on the wire side. Prefer a named alias from the contract:

```ts
export type CreateUserArgs = ClientArgsOf<(typeof contract)['createUser']>;
// { body: { name: string } }
```

Routes with no input sources have an empty `ClientArgsOf` — the client method takes no args.

### `HandlerArgsOf`

```ts
type HandlerArgsOf<TRoute extends RouteDef> = {
  readonly params?: …;   // when route declares params — InferOutput
  readonly query?: …;    // when route declares query — InferOutput
  readonly body?: …;     // when route declares body — InferOutput
  readonly headers?: …;  // when route declares headers — InferOutput
};
```

Parsed args inside handlers after server-side `parseRouteSources` (`InferOutput` per source — coerced/transformed).

### `OutputOf`

```ts
type OutputOf<TRoute extends RouteDef> =
  TRoute['output'] extends StandardSchemaV1
    ? StandardSchemaV1.InferOutput<TRoute['output']>
    : void;
```

`void` when the route omits `output` (`success: 204`).

### `ErrorOf`

```ts
type ErrorOf<TRoute extends RouteDef> = RailError<keyof TRoute['errors'] & string>;
```

Handler and server domain surface — declared route error-code keys only.

### `ClientErrorOf`

```ts
type ClientErrorOf<TRoute extends RouteDef> =
  | ErrorOf<TRoute>
  | RailError<'validation_error' | 'internal' | 'unavailable'>;
```

Client operation error union — domain codes plus built-in wire and transport failures.

### `ServerErrorOf`

```ts
type ServerErrorOf<TRoute extends RouteDef> =
  | ErrorOf<TRoute>
  | RailError<'validation_error' | 'internal'>;
```

Server-side error union for handlers (no client-synthesized `unavailable`).

### `parseRouteSources`

```ts
function parseRouteSources<TRoute extends RouteDef>(
  route: TRoute,
  sources: {
    readonly params?: Record<string, string>;
    readonly query?: unknown;
    readonly body?: unknown;
    readonly headers?: unknown;
  },
): ResultAsync<HandlerArgsOf<TRoute>, RailError<'validation_error'>>;
```

```ts
await parseRouteSources(contract.createUser, {
  body: { name: 'Ada' },
});
// Ok({ body: { name: 'Ada' } })

await parseRouteSources(contract.getUser, {
  params: { id: 'u1' },
});
// Ok({ params: { id: 'u1' } })

await parseRouteSources(contract.listUsers, {});
// Ok({}) — routes without input sources skip validation
```

Validates each declared source independently — `params`, `query`, `body`, and `headers` never merge. Works with any Standard Schema validator (Zod 4, Valibot, ArkType). Validation never throws; rejections and thrown validators become `Err(validation_error)`.

### `parseOutput`

```ts
function parseOutput<TRoute extends RouteDef>(
  route: TRoute,
  value: unknown,
): ResultAsync<OutputOf<TRoute>, RailError<'internal'>>;
```

Parse a handler success value through the route output schema. Routes without `output` (`success: 204`) resolve `Ok(undefined)` without running a schema. `serve` serialises the **parsed** value — not the handler's raw return.

**Transport stability:** the client re-parses the JSON body with the same schema. Output schemas must survive parse → `JSON.stringify` → `JSON.parse` → parse with equal values. Type-changing transforms (for example `z.number().transform(String)`) break the client. Prove compliance in tests with [`checkContractOutputs`](#checkcontractoutputs) (every operation) or [`checkTransportStability`](#checktransportstability) from `./testing`.

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

### `normalizePath`

```ts
function normalizePath(path: string): string;
```

Strip trailing slashes so `/users` and `/users/` share one matcher. `compileContract` rejects contracts where both forms appear.

```ts
const compiled = compilePath('/users/:id');
// { regex: /^\/users\/([^/]+)$/, paramNames: ['id'] }
```

### `matchPath`

```ts
type PathMatch =
  | { readonly kind: 'match'; readonly params: Record<string, string> }
  | { readonly kind: 'miss' }
  | { readonly kind: 'invalid_encoding'; readonly param: string };

function matchPath(compiled: CompiledPath, pathname: string): PathMatch;
```

Match a pathname against a compiled path; return decoded params, a miss, or an invalid percent-encoding capture.

```ts
matchPath(compiled, '/users/u1'); // { kind: 'match', params: { id: 'u1' } }
matchPath(compiled, '/orders/1'); // { kind: 'miss' }
matchPath(compiled, '/users/%zz'); // { kind: 'invalid_encoding', param: 'id' }
```

`serve` uses `compileRoutes` / `matchPath` (via `./server`), matching routes in contract declaration order. Static segments before dynamic (`/users/me` before `/users/:id`) is intentional — not a compile error.

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
  args: HandlerArgsOf<TRoute> & {
    request: Request;
    context: TContext;
  },
) => Result<OutputOf<TRoute>, ErrorOf<TRoute>>
  | ResultAsync<OutputOf<TRoute>, ErrorOf<TRoute>>
  | Promise<Result<OutputOf<TRoute>, ErrorOf<TRoute>>>;
```

Sync `ok` / `err`, `ResultAsync`, or `Promise<Result>` are all accepted. For `success: 204`, `OutputOf` is `void` — return `ok(undefined)` (or `ok()`).
### `Handlers`

```ts
type Handlers<TContract extends ContractDef, TContext> = {
  readonly [K in keyof TContract]: Handler<TContract[K], TContext>;
};
```

### `ServeOptions`

```ts
interface ServeOptions {
  readonly disclosure?: Disclosure | ((request: Request) => Disclosure);
  readonly origin?: string;
  readonly basePath?: `/${string}`;
  readonly hostStatuses?: Partial<HostStatuses>;
}
```

Omitted `disclosure` defaults to `public`. `respond` still defaults to `full`. `basePath` is stripped before matching (no trailing slash). Domain statuses come from each route's `errors` map; host codes use `HOST_STATUSES` merged with `hostStatuses`.

### `ServeHandler`

```ts
interface ServeHandler<TContext> {
  (request: Request, context: TContext): Promise<Response>;
  handle(
    request: Request,
    context: TContext,
  ): Promise<{ matched: false } | { matched: true; response: Response }>;
}
```

Callable `serve()` always answers. `handle()` is the cooperative mount: `matched: false` only outside `basePath` or the contract path set. Wrong method on a known path is `matched: true` with `route_not_found`. Use the unmatched branch for sibling non-JSON handlers (uploads, SSE) — [files and streams](./files-and-streams.md). Do not put those paths on the served contract.

### `serve`

```ts
function serve<TContract extends ContractDef, TContext>(
  contract: TContract,
  handlers: Handlers<TContract, TContext>,
  options?: ServeOptions,
): ServeHandler<TContext>;
```

```ts
const handlers: Handlers<typeof contract, { requestId: string }> = {
  getUser: ({ params }) => ok({ id: params.id, name: 'Ada' }),
  createUser: ({ body }) => ok({ id: 'new', name: body.name }),
};

const handler = serve(contract, handlers, {
  origin: 'users-api',
  basePath: '/api',
  disclosure: (req) =>
    req.headers.get('x-internal') === '1' ? 'full' : 'public',
});

await handler(new Request('http://localhost/api/users/u1'), { requestId: 'r1' });
```

**Construction:** `compileContract(contract)` runs at `serve()` call time; invalid contracts (duplicate routes, reserved domain codes, invalid statuses) throw `ContractConfigurationError`.

**Routing:** exact paths and single `:param` segments, declaration order (static before dynamic when both match). Unmatched requests → `route_not_found` at `HOST_STATUSES.route_not_found` (or `hostStatuses.route_not_found`). Path captures are percent-decoded; `invalid_encoding` → `validation_error`. `basePath` is stripped before matching.

**Input:** each declared source is read from the wire independently. Path `:param` values populate `params` before `parseRouteSources`. GET and DELETE read query into `query` (arrays as `key[]=`, unrepresentable shapes → `validation_error` before handler). POST, PUT, and PATCH read JSON body into `body` when declared (invalid JSON → `validation_error`); POST may also read `query`. Declared `headers` are read from `request.headers`. Empty or missing path params → `validation_error`. Sources never merge — `params.id` and `body.id` stay distinct.

**Declared statuses** per route: `route.success ?? 200`, each value in `route.errors`, `validation_error` when the route declares any input source (`params`, `query`, `body`, or `headers`), and `internal`. Undeclared mapped statuses degrade to `500`. Handler error codes not declared on the route — including forged `internal` — are normalised to wire `internal` with the original error under `cause`; `public` disclosure shows a constant top-level message. `success: 204` returns an empty body with no `Content-Type`.

**Origin:** `options.origin` stamps errors when absent (recursive on `cause`). Existing `origin` on an error is preserved.

**Disclosure:** omitted `disclosure` defaults to `public`. Per-request functions are supported; a throwing callback falls back to `public`.

**Throws:** handler exceptions and library escape paths become `internal` with diagnostics under `cause` — never an unhandled rejection. Ultimate fail-safe returns a constant JSON body.

**Output validation:** always on for routes with `output`. Successful handler values are validated through `parseOutput`; the **parsed** schema value is serialised. Handler `Err` results are not validated. Schemas must be transport-stable (see [`parseOutput`](#parseoutput)). Failures become `internal` with a generic top-level message and diagnostic detail under `cause`.

**Tests:** `src/server/serve.test.ts` — scenarios from [specs/cause-chaining.spec.md](https://github.com/project-eddy/never-rest/blob/main/specs/cause-chaining.spec.md), [specs/graded-disclosure.spec.md](https://github.com/project-eddy/never-rest/blob/main/specs/graded-disclosure.spec.md), and [specs/server-output-validation.spec.md](https://github.com/project-eddy/never-rest/blob/main/specs/server-output-validation.spec.md).

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
  readonly [K in keyof TContract]: ClientMethod<TContract[K]>;
};

// Routes with input sources: (args: ClientArgsOf<Route>) => ResultAsync<…>
// Routes without: () => ResultAsync<…>
```

One mapped type over the contract, one level deep — no recursion. Error type is `ClientErrorOf` (domain codes plus `validation_error`, `internal`, and `unavailable`).

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
  .getUser({ params: { id: 'u1' } })
  .andThen((user) => client.loadOrders({ params: { userId: user.id } }))
  .map((orders) => orders.orders.length);
```

**Behaviour:** `compileContract` runs at construction. Validates client args per source via `parseRouteSources` (`ClientArgsOf`); path params must be non-empty; query arrays use `key[]=`. Per-call `args.headers` merge over `ClientOptions.headers` (per-call wins). Only `route.success ?? 200` is treated as `Ok`; any other 2xx is `validation_error` before the body is trusted. `success: 204` resolves `Ok(undefined)` without reading a body. JSON `RailError` with a declared domain code (`error.code in route.errors`), `validation_error`, or `internal` → `Err`; undeclared or reserved remote codes → `Err(internal)` with constant message and remote error under `cause`; non-JSON body → `Err(internal)`; network failure → `Err(unavailable, { retryable: true })`. Header/body serialization failures → `Err(internal)`. Never throws.

### `buildRequest`

```ts
interface BuiltRequest {
  readonly url: string;
  readonly init: RequestInit;
}

function buildRequest(
  route: RouteDef,
  compiledPath: CompiledPath,
  baseUrl: string,
  args: ClientArgsOf<RouteDef>,
  headers: HeadersInit | undefined,
  credentials?: RequestCredentials,
): Result<BuiltRequest, RailError<'validation_error' | 'internal'>>;
```

Low-level fetch URL and `RequestInit` from declared sources. Used by `createClient`; exported for custom transports.

**Tests:** `src/client/create.test.ts` — scenarios from [specs/client-results.spec.md](https://github.com/project-eddy/never-rest/blob/main/specs/client-results.spec.md) and [specs/wire-serialization.spec.md](https://github.com/project-eddy/never-rest/blob/main/specs/wire-serialization.spec.md).

---

## `@eddy-works/never-rest/testing`

Test-time helpers — not for production request paths.

### `createTestClient`

```ts
interface CreateTestClientOptions<TContext> {
  readonly context?: TContext;
  readonly baseUrl?: string;
  readonly basePath?: `/${string}`;
  readonly headers?: HeadersInit;
  readonly disclosure?: Disclosure;
}

function createTestClient<TContract extends ContractDef, TContext>(
  contract: TContract,
  handlers: Handlers<TContract, TContext>,
  options?: CreateTestClientOptions<TContext>,
): Client<TContract>;
```

Typed in-process client through the real `serve` path. Default `baseUrl` is `http://never-rest.test`. `basePath` is applied to both the handler and the client.

```ts
import { createTestClient } from '@eddy-works/never-rest/testing';

const client = createTestClient(contract, handlers);
const result = await client.getUser({ params: { id: 'u1' } });
```

### `assertProtocolResponse`

Re-exported from `./testing` and `./server`. Asserts serve protocol invariants (status, JSON envelope, declared codes, disclosure) in tests.

### `checkTransportStability`

```ts
function checkTransportStability<T extends StandardSchemaV1>(
  schema: T,
  sample: StandardSchemaV1.InferInput<T>,
): ResultAsync<void, RailError<'transport_unstable'>>;
```

Verify a schema survives JSON wire round-trip: parse the sample, serialise, parse again, and compare values. Use in contract tests for every output schema (and any input schema with transforms you rely on).

```ts
import { checkTransportStability } from '@eddy-works/never-rest/testing';

const result = await checkTransportStability(userSchema, { id: 'u1', name: 'Ada' });
result.isOk(); // true when transport-stable
```

Fails for schemas whose transforms change the wire shape — for example `z.number().transform(String)`.

### `checkContractOutputs`

```ts
function checkContractOutputs<TContract extends ContractDef>(
  contract: TContract,
  samples: ContractOutputSamples<TContract>,
): ResultAsync<void, RailError<'transport_unstable'>>;
```

Run `checkTransportStability` on every contract output. The `samples` object must include one value per operation that declares `output` — omitting a key is a type error. Routes with `success: 204` (no output schema) are skipped.

```ts
import { checkContractOutputs } from '@eddy-works/never-rest/testing';

const result = await checkContractOutputs(contract, {
  getUser: { id: 'u1', name: 'Ada' },
  listUsers: [{ id: 'u1', name: 'Ada' }],
});
```

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

const handler = serve(contract, handlers, { origin: 'users-api' });
createServer(toNodeHandler((request) => handler(request, undefined))).listen(3000);

// Express
app.use(toNodeHandler((request) => handler(request, undefined)));
```

Close over `serve` context when needed: `toNodeHandler((req) => handler(req, ctx))`.

Incoming POST/PUT/PATCH/DELETE bodies are fully buffered in `toWebRequest` before the fetch handler runs. Register Express upload routes *before* this bridge if you need the live stream. Outgoing SSE/downloads can still pipe via `writeWebResponse`. See [files and streams](./files-and-streams.md).

**Tests:** `src/node/to-node-handler.test.ts`.

---

## `@eddy-works/never-rest/openapi`

OpenAPI 3.1 projection from the compiled contract. No statuses argument — domain statuses come from `RouteDef.errors`; host statuses from `HOST_STATUSES`.

### `toOpenAPI`

```ts
function toOpenAPI<TContract extends ContractDef>(
  contract: TContract,
  options: {
    readonly info: { readonly title: string; readonly version: string; readonly description?: string };
    readonly servers?: readonly { readonly url: string; readonly description?: string }[];
  },
): Record<string, unknown>;
```

Compiles the contract, converts Standard Schema via `~standard.jsonSchema` (draft 2020-12), maps `:param` paths to `{param}`, and emits a public `RailError` component plus `RouteNotFound` once per path. Validators that cannot convert to JSON Schema (for example Valibot) throw `OpenApiExportError` — the exporter never invents `{}`.

```ts
import { toOpenAPI } from '@eddy-works/never-rest/openapi';

const document = toOpenAPI(contract, {
  info: { title: 'Users API', version: '1.0.0' },
});
```

### `OpenApiExportError`

Thrown when a schema cannot be converted to JSON Schema, or when converted schema shape is unusable for parameters.

**Tests:** `src/openapi/to-openapi.test.ts` — scenarios from [specs/openapi-export.spec.md](https://github.com/project-eddy/never-rest/blob/main/specs/openapi-export.spec.md).

---

## `@eddy-works/never-rest/query`

Result-preserving cache-layer adapters. Structurally compatible with TanStack Query; no React or TanStack dependency. Each `queryFn` / `mutationFn` **resolves** with a `Result` and never rejects, so the railway survives the cache boundary. TanStack's `isError` will not fire for domain failures — branch on `data.isOk()` / `data.isErr()`.

### `createQueryOptions`

```ts
function createQueryOptions<TContract extends ContractDef>(
  client: Client<TContract>,
): {
  readonly [K in keyof TContract]: (args?: ClientArgsOf<TContract[K]>) => {
    readonly queryKey: readonly unknown[];
    readonly queryFn: () => Promise<Result<OutputOf<TContract[K]>, ClientErrorOf<TContract[K]>>>;
  };
};
```

Query key is `['never-rest', operation, args ?? {}]`.

### `createMutationOptions`

```ts
function createMutationOptions<TContract extends ContractDef>(
  client: Client<TContract>,
): {
  readonly [K in keyof TContract]: () => {
    readonly mutationFn: (
      args?: ClientArgsOf<TContract[K]>,
    ) => Promise<Result<OutputOf<TContract[K]>, ClientErrorOf<TContract[K]>>>;
  };
};
```

### `isRetryable`

```ts
function isRetryable(error: RailError): boolean;
```

`true` only for `unavailable` and `internal`.

**Tests:** `src/query/options.test.ts`.
