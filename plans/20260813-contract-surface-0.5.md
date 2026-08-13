# Plan: contract surface 0.5

Mission: make the contract the single self-contained source of HTTP truth, project it into OpenAPI 3.1, and add fetch-native mount, test, and UI-data seams — without adding middleware or framework adapter packages.

Definition of done:

- A route declares its own error statuses and success status; `serve()` no longer takes a `statuses` map.
- `toOpenAPI(contract, { info })` produces an OAS 3.1 document from the contract alone, or fails loudly.
- Hosts mount with `basePath` and a cooperative `handle()`; `route_not_found` behaviour is unchanged for exclusive mounts.
- `createTestClient` gives a typed in-process client that goes through the real `serve` path.
- A `Result`-preserving query-options adapter exists with no React or TanStack dependency.
- Streaming and multipart have a written feasibility verdict, no shipped API.
- Full gate suite passes: lint, typecheck, tests with coverage, build, `perf:check`, `specs:lint`, examples typecheck, conformance, `publint`, `attw`.

Validation:

```bash
pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build
pnpm perf:check && pnpm specs:lint
pnpm examples:typecheck && pnpm examples:conformance
pnpm exec publint && pnpm exec attw --pack --profile esm-only
```

Size budget: roughly 45–55 files, about +2,600 / −900 lines. Slice 07 is the bulk of the file count and is mechanical migration. Exceeding this triggers re-scoping, most likely by deferring slice 06.

## Changes from proposal

The proposal is `research/20260812-rest-contract-library-expectations.md`.

| Proposal says | Plan says | Rationale |
| --- | --- | --- |
| Keep `ServeStatusMap` external; the exporter takes it as an explicit input | Move error statuses onto `RouteDef`; `serve()` loses `statuses` | Operator decision. The contract alone must be exportable, and OpenAPI stops depending on a second artefact that can drift. |
| Gather adopter evidence before ordering mount/test against OpenAPI | Build both in one release, sequenced behind the contract-shape change | Operator decision. Both are downstream of the same contract change, so splitting them across releases would pay the migration cost twice. |
| UI query wrappers stay out of the core | Ship a `Result`-preserving query-options adapter | Operator decision, constrained so the adapter never unwraps or throws. |
| Streaming and multipart out of scope | Written feasibility spike, no API | Operator decision. Cheap to answer now, and the answer shapes whether `output` can stay JSON-only. |
| Headers and success-status variants come after the first two capabilities | Headers and success statuses land in the same contract-shape slice | They widen the same types. Doing them in one pass costs one perf re-baseline instead of three. |

## Reuse

| Capability | Existing artifact | Verdict | Why |
| --- | --- | --- | --- |
| OpenAPI paths and operations | `compileContract`, `CompiledContract` (`src/contract/compile.ts:32-40,76-168`) | reuse | Already normalises paths, rejects duplicates, and holds per-route metadata. |
| OpenAPI response statuses | `RouteDef.errors` after slice 01, host defaults | extend | Statuses become contract data instead of a serve-time argument. |
| OpenAPI schemas | `~standard.jsonSchema` on Zod 4.4.3 and ArkType 2.2.3 | reuse | Verified at runtime in the installed tree. Valibot 1.4.2 has no conversion path — see Decisions for humans. |
| OpenAPI error body shape | `disclose(error, 'public')` (`src/disclose.ts`) | reuse | The public projection is the shape external callers actually receive. |
| OpenAPI query encoding | `appendQueryValue` (`src/client/request.ts:74-106`), `searchParamsToObject` (`src/server/serve.ts:149-167`) | reuse | The `key[]` convention must be documented from the code that implements it, not restated. |
| Success status plumbing | `respond` (`src/respond.ts:22-40`) | reuse | Already generic over `TSuccess`; only `serve` hard-codes 200. |
| Mount matching | `compileRoutes` / `matchRoute` (`src/server/router.ts:18-53`), `isContractPath` (`src/contract/compile.ts:46-57`) | extend | Path and method matching exist; prefix stripping and a cooperative result do not. |
| In-process test client | `createClient` injectable `fetch` (`src/client/create.ts`), gateway wiring (`examples/gateway/src/run.ts:58-69`) | extend | The pattern is proven in an example; it needs to become a supported export. |
| Protocol assertions in tests | `assertProtocolResponse` (`src/railway/assert-protocol.ts:16-64`) | reuse | Already written and exercised; currently unexported. |
| Route request headers | `ClientOptions.headers` (`src/client/types.ts:14`) | build new | Client-global only. Nothing declares or validates per-route request headers. |
| Query-options adapter | `Client<TContract>` (`src/client/types.ts:28-30`) | build new | Only a documentation pattern exists today. |
| Streaming / multipart | `readRequestBody`, `jsonResponse` (`src/server/serve.ts:169-194,240-252`) | build new | The whole path is JSON text in and out; this slice only writes the verdict. |

## What stays the same

- Handlers return `Result` / `ResultAsync`. No middleware, no interceptors, no throw path for declared errors.
- `serve()` called as a function still answers every request, including `route_not_found`.
- Graded disclosure, cause chains, and `origin` stamping are untouched.
- Output schema remains the wire authority for success bodies.
- No framework adapter packages. `./node` stays the only bridge.
- The client stays a `ResultAsync` client; nothing in this plan unwraps a `Result` for the caller.

## Decisions for humans

1. **Valibot and OpenAPI.** Valibot 1.4.2 in this tree exposes no JSON Schema conversion. Options: export fails loudly for Valibot contracts, or add `@valibot/to-json-schema` as an optional peer dependency and use it when present. Slice 04 must not silently emit `{}`.
2. **Same error code, different statuses.** Making `errors` a per-route map allows `not_found` to be 404 on one route and 410 on another. Permit it, or have `compileContract` reject cross-route disagreement?
3. **Subpath name for the adapter.** `./query` reads as query strings; `./data` or `./tanstack` are alternatives.
4. **Removal versus deprecation of `ServeOptions.statuses`.** The plan removes it in one step, with a migration table. A deprecation window would mean supporting two sources of status truth simultaneously.
5. **204 handler ergonomics.** A 204 route has no `output`, so its handler returns `Result<void, …>`. Confirm that is preferable to requiring an explicit empty schema.

## Coordination brief

| Slice | Objective | Owns (exclusive) | Must not touch | Interfaces exposed | Interfaces consumed | After |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Contract shape: statuses, success, headers | `src/contract/**`, `src/status.ts`, `src/respond.ts`, `src/error.ts`, `perf/generate-benches.mjs`, `perf/benches/**`, `perf/fixtures/**`, `specs/contract-compilation.spec.md`, `specs/status-mapping.spec.md` | `src/server/**`, `src/client/**`, `perf/baseline.json` | `RouteDef`, `HostStatuses`, `HOST_STATUSES`, `ClientArgsOf`, `HandlerArgsOf`, `OutputOf`, `ErrorOf`, `parseRouteSources` | — | — |
| 02 | Server runtime: new statuses, 201/204, basePath, cooperative handle | `src/server/**`, `specs/server-output-validation.spec.md`, `specs/railway-boundary.spec.md`, `src/railway/**` | `src/contract/**`, `src/client/**` | `ServeOptions`, `ServeHandler`, `assertProtocolResponse` (re-export path) | slice 01 types | 01 |
| 03 | Client runtime: headers arg, success status, 204 no-body | `src/client/**`, `specs/client-results.spec.md`, `specs/wire-serialization.spec.md`, `specs/input-sources.spec.md` | `src/server/**`, `src/contract/**` | `ClientOptions`, `Client`, `buildRequest` export | slice 01 types | 01 |
| 04 | OpenAPI 3.1 export | `src/openapi/**`, `specs/openapi-export.spec.md` | everything outside `src/openapi/**` | `toOpenAPI`, `OpenApiExportError` | slice 01 types, `disclose`, `compileContract` | 01 |
| 05 | Testing primitives | `src/testing/**` | `src/server/**`, `src/client/**` | `createTestClient`, `assertProtocolResponse` | slices 01–03 | 02, 03 |
| 06 | Result-preserving query adapter | `src/query/**` | `src/client/**` | `createQueryOptions`, `createMutationOptions`, `isRetryable` | slice 03 `Client` | 03 |
| 07 | Examples, conformance, migration guide | `examples/**`, `docs/migrating.md`, `docs/comparison.md`, `docs/concepts.md`, `docs/advanced-usage.md`, `docs/railway-patterns.md`, `docs/examples.md` | `src/**`, `docs/api.md` | — | all | 01, 02, 03 |
| 08 | Streaming and multipart feasibility | `research/20260813-streaming-multipart-feasibility.md` | everything else | written verdict | — | — |

Contested files and their single owner:

- `package.json` (exports, `typesVersions`, scripts, dependencies) — **lead**, at integration. Slices state the exact entry they need in their final report.
- `pnpm-lock.yaml` — **lead**. No slice adds a dependency without asking.
- `CHANGELOG.md` — **lead**. Every slice supplies its entry text as prose in its report; the lead writes the file once.
- `docs/api.md` — **lead**. Each slice supplies its reference section as prose.
- `README.md` — **lead**.
- `specs/README.md` — **lead**. It holds both the spec index (L15–23) and the spec-to-test mapping (L89–98), so every slice that adds a spec or test file supplies its rows as prose rather than editing the file.
- `perf/baseline.json` — **lead**, after slice 01 lands and benches are regenerated.
- `src/index.ts` and other barrels — owned by the slice that owns the directory; the root barrel is **lead**.

## Declared interfaces

These are fixed before implementation so slices can compile against each other.

```ts
// slice 01 — src/contract/types.ts
export interface RouteDef {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly params?: StandardSchemaV1;
  readonly query?: StandardSchemaV1;
  readonly body?: StandardSchemaV1;
  readonly headers?: StandardSchemaV1;
  /** Omitted only when success is 204. */
  readonly output?: StandardSchemaV1;
  /** Success status for this route. Defaults to 200. */
  readonly success?: number;
  /** Domain error code to HTTP status. Replaces the string array and ServeStatusMap. */
  readonly errors: { readonly [code: string]: number };
  readonly summary?: string;
}

export type OutputOf<TRoute extends RouteDef> =
  TRoute['output'] extends StandardSchemaV1
    ? StandardSchemaV1.InferOutput<TRoute['output']>
    : void;

export type ErrorOf<TRoute extends RouteDef> = RailError<keyof TRoute['errors'] & string>;
```

```ts
// slice 01 — src/status.ts
export interface HostStatuses {
  readonly validation_error: number;
  readonly internal: number;
  readonly route_not_found: number;
}
export const HOST_STATUSES: HostStatuses; // 400 / 500 / 404
```

```ts
// slice 02 — src/server/types.ts and serve.ts
export interface ServeOptions {
  readonly disclosure?: Disclosure | ((request: Request) => Disclosure);
  readonly origin?: string;
  /** Stripped before matching. No trailing slash. */
  readonly basePath?: `/${string}`;
  readonly hostStatuses?: Partial<HostStatuses>;
}

export interface ServeHandler<TContext> {
  (request: Request, context: TContext): Promise<Response>;
  /** Cooperative mount. matched is false only when the path is outside the contract. */
  handle(
    request: Request,
    context: TContext,
  ): Promise<{ matched: false } | { matched: true; response: Response }>;
}
```

```ts
// slice 04 — src/openapi/index.ts
export interface OpenApiOptions {
  readonly info: { readonly title: string; readonly version: string; readonly description?: string };
  readonly servers?: readonly { readonly url: string; readonly description?: string }[];
}
export function toOpenAPI<TContract extends ContractDef>(
  contract: TContract,
  options: OpenApiOptions,
): Record<string, unknown>;
export class OpenApiExportError extends Error {}
```

```ts
// slice 05 — src/testing/index.ts
export function createTestClient<TContract extends ContractDef, TContext>(
  contract: TContract,
  handlers: Handlers<TContract, TContext>,
  options?: {
    readonly context?: TContext;
    readonly baseUrl?: string;
    readonly basePath?: `/${string}`;
    readonly headers?: HeadersInit;
    readonly disclosure?: Disclosure;
  },
): Client<TContract>;
```

```ts
// slice 06 — src/query/index.ts
// Structurally compatible with TanStack query options. No React or TanStack dependency.
export function createQueryOptions<TContract extends ContractDef>(
  client: Client<TContract>,
): {
  readonly [K in keyof TContract]: (args?: ClientArgsOf<TContract[K]>) => {
    readonly queryKey: readonly unknown[];
    // Resolves with a Result. Never rejects, so the railway survives the cache boundary.
    readonly queryFn: () => Promise<Result<OutputOf<TContract[K]>, ClientErrorOf<TContract[K]>>>;
  };
};
export function isRetryable(error: RailError): boolean;
```

## Slice 01: contract shape

Objective: the contract carries its own statuses, success code, and request headers.

Owned paths: `src/contract/**`, `src/status.ts`, `src/respond.ts`, `src/error.ts`, `perf/generate-benches.mjs`, `perf/benches/**`, `perf/fixtures/**`, `specs/contract-compilation.spec.md`, `specs/status-mapping.spec.md`.

Steps:

1. Change `RouteDef.errors` to a code-to-status map; add `headers?`, `success?`; make `output?` optional.
2. Update `ErrorOf` to `keyof … & string`, `OutputOf` to the conditional above, and add the `headers` arm to `ClientArgsOf` / `HandlerArgsOf`.
3. Add `HostStatuses` and `HOST_STATUSES` to `src/status.ts`; keep `statusFor` and `toDeclaredResponse` working against a plain map.
4. Extend `parseRouteSources` and `RawRouteSources` with `headers`.
5. Extend `compileContract` validation: every error status is an integer 400–599; `success` is 200, 201, 202, or 204; `success: 204` requires no `output`; any other success requires `output`; reserved host codes cannot appear in `errors`.
6. Regenerate perf benches for the new shape. Report the new instantiation numbers; do not edit `perf/baseline.json`.

Acceptance checks: `pnpm typecheck`, `pnpm test`, `pnpm specs:lint`, and a reported `perf:check` slope with the delta against the 1,800 per-route budget.

## Slice 02: server runtime

Objective: `serve` reads statuses from the contract, honours declared success codes, and mounts cleanly.

Owned paths: `src/server/**`, `src/railway/**`, `specs/server-output-validation.spec.md`, `specs/railway-boundary.spec.md`.

Steps:

1. Remove `statuses` from `ServeOptions`; derive domain statuses from `route.errors` and host statuses from `HOST_STATUSES` merged with `options.hostStatuses`.
2. Replace the hard-coded `success: 200` (`serve.ts:92,263,442`) with `route.success ?? 200`; `declaredStatusesForRoute` seeds from the same value.
3. For `success: 204`, skip output parsing and return an empty body with no `Content-Type`.
4. Add `basePath`: strip exactly one prefix before matching, reusing `normalizePath` trailing-slash rules; a request outside the prefix is `route_not_found` for the callable form.
5. Add `handle()`: `matched: false` only when the path is outside `basePath` or outside `isContractPath`; a known path with an unknown method stays `matched: true` with a `route_not_found` response.
6. Export `assertProtocolResponse` for slice 05 to re-export.

Acceptance checks: existing `serve.test.ts` suites pass unchanged except for intended status changes; new scenarios for 201, 204, `basePath`, and both mount forms; `route_not_found` still answers on every exclusive-mount miss.

## Slice 03: client runtime

Objective: the client sends declared headers and understands declared success statuses.

Owned paths: `src/client/**`, `specs/client-results.spec.md`, `specs/wire-serialization.spec.md`, `specs/input-sources.spec.md`.

Steps:

1. Accept and validate `args.headers` against `route.headers`, merged over `ClientOptions.headers`, with per-route values winning.
2. Treat `route.success ?? 200` as the expected status; a 2xx that is not the declared status is a `validation_error` before the body is trusted.
3. For a 204 route, resolve `ok(undefined)` without reading a body.
4. Keep the existing bracket-array query encoding and pre-fetch `validation_error` behaviour untouched.
5. Export `buildRequest` from the client barrel for slice 04's encoding tests to reference.

Acceptance checks: header round-trip through a real `Request`; 204 produces no body read; wrong-status 2xx fails closed; existing wire-serialisation scenarios unchanged.

## Slice 04: OpenAPI export

Objective: an honest OAS 3.1 document from the contract alone.

Owned paths: `src/openapi/**`, `specs/openapi-export.spec.md`.

Steps:

1. Compile the contract, then walk routes into `paths` keyed by the OpenAPI path template, with `operationId` set to the contract key and `summary` from `RouteDef.summary`.
2. Convert `params`, `query`, `headers`, `body`, and `output` through `~standard.jsonSchema` with target `draft-2020-12`; set `jsonSchemaDialect` accordingly. Throw `OpenApiExportError` naming the operation and source when a schema cannot convert.
3. Emit path parameters as `style: simple`, and array query parameters with the real `name[]` wire name, so generated clients match `buildRequest`.
4. Emit the declared success status with the output schema, or a bodyless 204; emit one response per declared error status using a shared `RailError` component in its public disclosure shape; emit the host `route_not_found` status once at path level.
5. No auth, examples, callbacks, webhooks, imports, or client codegen.
6. Add a golden-fixture test that exports the conformance contract and asserts the document, so drift is visible in review.

Acceptance checks: golden fixture matches; a contract using a validator without JSON Schema support throws rather than emitting an empty schema; every status in the document is one the runtime can actually produce.

## Slice 05: testing primitives

Objective: a typed in-process client and exported protocol assertions.

Owned paths: `src/testing/**`.

Steps:

1. Implement `createTestClient` by constructing the real `serve` handler and passing it as `createClient`'s `fetch`.
2. Re-export `assertProtocolResponse`.
3. Keep `checkContractOutputs` and `checkTransportStability` unchanged.
4. Add a test proving the test client goes through disclosure and output validation, not around them.

Acceptance checks: a domain error surfaces as a typed `Err` with the contract-declared status; a host 404 is distinguishable from a domain `not_found`.

## Slice 06: query adapter

Objective: cache-layer integration that keeps the railway intact.

Owned paths: `src/query/**`.

Steps:

1. Build query keys from the operation name and the args object.
2. `queryFn` resolves with the `Result` and never rejects.
3. Provide `isRetryable` for use as a retry predicate.
4. Zero runtime dependencies; no React, no TanStack import, structural typing only.
5. Document the trade-off in the module's own prose: `isError` will not fire, because errors arrive as data.

Acceptance checks: type test showing `data` is `Result<Output, ClientErrorOf<Route>>`; a failing call resolves rather than rejecting.

## Slice 07: examples, conformance, migration

Objective: every example compiles on the new contract shape and the migration is written down.

Owned paths: `examples/**`, `docs/migrating.md`, `docs/comparison.md`, `docs/concepts.md`, `docs/advanced-usage.md`, `docs/railway-patterns.md`, `docs/examples.md`.

Steps:

1. Move each example's `statuses` map into its contract's `errors`.
2. Replace the hand-rolled `/api` strip in the Next example with `basePath`, and the `isContractPath` pre-gate in the SvelteKit example with `handle()`.
3. Add at least one route using `success: 201` and one using `204` to the conformance contract, plus header-declaring route coverage.
4. Extend conformance to the Next and SvelteKit mount styles.
5. Write the 0.4 to 0.5 migration section: status map relocation, `errors` shape, `output` optionality, mount changes.
6. Update `docs/comparison.md` so the "Not in scope" list no longer claims OpenAPI and UI integrations are excluded.

Acceptance checks: `pnpm examples:typecheck` and `pnpm examples:conformance` pass; no example contains a `ServeStatusMap`.

## Slice 08: streaming and multipart feasibility

Objective: a written verdict, no code.

Owned paths: `research/20260813-streaming-multipart-feasibility.md`.

Steps:

1. Establish what breaks: `readRequestBody`, `jsonResponse`, `parseOutput`, and `response.text()` all assume JSON text.
2. Assess whether a streaming response can stay inside `Result` semantics, given that failures may occur after headers are sent, and say plainly what a caller could still rely on.
3. Assess multipart request bodies against Standard Schema validation and the `File`/`Blob` boundary.
4. State the interaction with graded disclosure: an error raised mid-stream cannot be redacted retroactively.
5. Recommend one of: not viable within the current invariants, viable with named constraints, or viable only for a separate non-railway escape hatch.

Acceptance checks: the document names the exact functions each option would change and gives a recommendation with reasoning; no source file is modified.
