# Plan: `@eddy-works/never-rest` v0.1

Mission: a small, from-scratch HTTP contract library where handlers return `Result` instead of
throwing, errors carry their causal chain across service boundaries, and disclosure is graded by
caller trust — built so that its type-checking cost per route is a published, enforced number.

Inspired by `ts-rest` (contract-first, declared response statuses) and `oRPC` (typed errors, Standard
Schema, a non-throwing client). **Depends on neither.**

Definition of done:

- `@eddy-works/never-rest@0.1.0` published from `github.com/project-eddy/never-rest` via OIDC
  trusted publishing, passing `publint` and `attw`.
- Zero runtime dependencies. `neverthrow` is the only required peer. No validator dependency at all —
  consumers bring any Standard Schema validator (Zod 4, Valibot, ArkType).
- Server and client both work against a hand-written contract, on the Web-standard
  `Request → Response` interface, with no framework adapter needed.
- **Published type budget:** measured instantiations per route, enforced in CI, and at least 3×
  cheaper than `@ts-rest/core`'s measured ~5,984 per route.
- An example gateway shows a downstream error bubbling through a second service with its cause chain
  intact, rendered at three disclosure levels.
- Observable behaviour specified in Gherkin and extracted into runnable tests.
- An agent skill ships as a lookup index over the package docs.

Validation (all must pass):

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm perf:check      # fails if instantiations per route regress past the published budget
pnpm build
pnpm dlx publint
pnpm dlx @arethetypeswrong/cli --pack
```

Size budget: ~70 new files, ~3,500 added lines, all inside the new `never-rest` repo. **Zero lines
changed** in `ombo`, `liveship`, `skill-book` or `utility-belt`. Building any of the deliberately
excluded features below triggers re-scoping.

## Why from scratch, and what that buys

The [primary-source research](../../ombo/.scratch/research/20260809-neverest-primary-sources.md)
made wrapping untenable and, in the same breath, made building cheap:

- **ts-rest is stalled** — last stable 2025-03-04, the Standard Schema line died at an RC, the v4 PR
  is a draft with failing CI. Its Zod 4 incompatibility lives in six of its own shipped `.d.ts` files,
  so no wrapper can fix it.
- **oRPC is throw-based on the server.** Its typed errors *require* `throw errors.NOT_FOUND()`. The
  non-throwing `safe()` client is a tuple you branch on, with no `map` / `andThen` / `mapErr` /
  `match`. It solved typed errors over the wire; it did not make failure composable.
- **The measured cost is in the DSL, not the helpers.** `c.router()` costs ~5,984 instantiations per
  route; plain object literals cost ~1,193 for the same 20 routes. `strictStatusCodes` and
  `commonResponses` are free. So the expensive thing is precisely the part we would be inheriting.

Three design consequences follow, and they are the whole library:

1. **The contract is a plain object literal, checked with `satisfies`. No builder chain.** No
   `initContract()`, no `.input().output().handler()`. This is where the 5× saving comes from, and it
   is the claim slice 06 must defend with numbers.
2. **There is no middleware system.** Middleware exists in ts-rest, oRPC and tRPC because handlers
   throw and something has to intercept. When handlers return `Result`, "middleware" is `andThen` —
   auth, rate limiting and logging are just functions in the chain. This removes the single largest
   piece of surface area a library like this normally carries.
3. **Validation is Standard Schema, so there is no validator dependency and no version fracture.**
   `@standard-schema/spec` is types-only and zero-runtime. Its `Issue` is only `{ message, path? }`
   with no error codes, which would be a problem for a validation library — but we own `RailError`
   above it anyway, so it costs us nothing.

## Deliberately excluded from v0.1

Naming these is load-bearing, because a from-scratch library dies of scope, not of bugs. None of the
following ship, and adding one is a re-scoping decision, not an implementation detail:

| Excluded | Why, and what to do instead |
| --- | --- |
| OpenAPI generation | Cheap to add later — Standard Schema v1.1.0 covers JSON Schema and Zod 4.4.3 already exposes `~standard.jsonSchema` — but it is not needed to prove the thesis. |
| Middleware / interceptors | Structurally unnecessary. Compose with `andThen`. |
| Framework adapters (Express, Fastify, Hono, SvelteKit) | The Web-standard `Request → Response` handler already runs on Cloudflare Workers, Deno, Bun, Node 18+, SvelteKit and Next. Adapters are a support burden with no new capability. |
| Query-library integrations (TanStack / svelte-query) | The client returns `ResultAsync`; wiring that into a query library is five lines in userland. |
| Streaming, SSE, subscriptions, file uploads / multipart | Real work, orthogonal to the thesis, and each one is a design project of its own. |
| Codegen or a CLI | The contract is hand-written TypeScript. That is the point. |
| Advanced routing | Exact paths plus single `:param` segments, matched by precompiled regex in declaration order. Fat services have dozens of routes, not thousands. No wildcards, no nested routers, no radix tree. |

## Changes from the spoken brief

| Brief says | Plan says | Rationale |
| --- | --- | --- |
| Call it `neverest` | `never-rest`, published `@eddy-works/never-rest` | `neverest@0.1.0` is already an email-sync CLI on crates.io. The hyphen removes the collision and keeps the "never-throw for REST" reading. |
| "A convention built over the configuration of ts-rest" — wrap it rather than reimplement | From scratch, no ts-rest and no oRPC dependency, both used as references | Dan's call after reading the research. Wrapping a stalled base whose defect is in its own declarations means inheriting an unfixable bug and its type cost. |
| "Extending the neverthrow library as needed" | neverthrow stays an unmodified peer dependency — no fork, no patch, no re-export | Forking a widely used library is a permanent maintenance tax. If something is genuinely missing, upstream it. |
| Ombo implicitly the first consumer | In-repo example only; Ombo migrates later | Ombo's `pnpm check` and `pnpm build` are both red, it has no CI at all, and it has 131 uncommitted files mid Next.js → SvelteKit cutover. |
| Type performance as "a clear criterion for success" | A published per-route instantiation budget, enforced in CI, benchmarked against ts-rest | TypeScript 7.0.2's Go port (GA 2026-07-08) cut the IDE-lag pain to roughly a tenth, so "it feels fast" is no longer a claim worth making. A number that nobody else publishes still is. |
| Gherkin "to pin down what the library has to do" | Gherkin covers the rule-shaped behaviour: status mapping, graded disclosure, cause chaining, client result mapping | Gherkin earns its keep on decision tables. Type-level behaviour is covered by the perf gate and type tests instead. |

## Why this is a package and not a snippet

The error half of this has already been hand-rolled twice, independently, and both copies are paying
for it:

- **Ombo** implements it in `apps/web/src/lib/server/`: `respond()` exists but no handler imports it,
  so nine handlers inline `toDeclaredHttpResponse`; `statusFor` is welded to one product's error
  codes; and the client needs a hand-written type because Zod casts erased its inference.
- **LiveShip** implements the same railway with `AppError` and `AgentError`, mapping to exit codes and
  agent-readable failure envelopes rather than HTTP, sharing no vocabulary with Ombo.

Neither can borrow from the other. Separately, oRPC's own docs carry three DANGER callouts telling
developers not to put sensitive data in `ORPCError.data` — disclosure handled by repeated written
warning. That is the gap `disclose()` closes with a mechanism.

## Reuse

| Capability | Existing artifact | Verdict | Why |
| --- | --- | --- | --- |
| Result → HTTP mapping | `ombo/apps/web/src/lib/server/http-errors.ts`, `respond.ts` | **extend** | Right shape including the declared-status discipline; needs `statusFor` parameterised off Ombo's hard-coded code union. |
| Adapter tests | `ombo/apps/web/src/lib/server/http-errors.test.ts` | **reuse** | Already asserts the load-bearing rule: an undeclared status degrades to 500. |
| Error taxonomy | `ombo/packages/contracts/src/api/error.ts`, `map-error.ts` | **extend** | `{code, message, issues?}` plus `unauthorizedApiError` / `internalApiError` generalise cleanly. |
| Cause chaining | `liveship/packages/liveship-core/src/agent-error.ts` (`cause`, `serializeCause`) | **extend** | Chain semantics already solved; currently CLI/exit-code shaped rather than HTTP shaped. |
| Release pipeline | `liveship/packages/liveship-context-prune/.github/workflows/release.yml` | **extend** | Already OIDC trusted publishing with no `NPM_TOKEN` and a tag-matches-version check. Needs two corrections (see slice 01). |
| Gherkin specs → tests | `utility-belt/mixins/gherkin/SKILL.md`, `utility-belt/mixins/gherkin/scripts/extract-gherkin.mjs` | **reuse** | Established convention: markdown specs, one `When` per scenario. |
| Doc-index skill shape | `~/.cursor/skills/codebase-design/SKILL.md` | **extend** | Best local exemplar of a lookup index with no workflow. |
| Repo scaffolding | `skill-book/tsconfig.base.json`, `packages/protocol/package.json` | **extend** | Strict TS + `exports` map + `dist` emit worked out; skill-book packages are all private so publishing config is new. |
| Type-perf budget | — | **build new**, using `@ark/attest` | Nothing local has any instantiation gate. `@ark/attest` is the only established convention (arktype's own `prChecks`); zod's harness is private, oRPC benches runtime only, ts-rest has none. |
| Contract, router, server, client | — | **build new** | The decision this plan records. Reference `ts-rest` and `oRPC` for API shape; copy no code. |
| Graded disclosure | — | **build new** | Nothing anywhere redacts error detail by caller trust. ~40 lines of pure function. |

## What stays the same

- `neverthrow` — unforked peer dependency. The package adds no methods to `Result`.
- `ombo`, `liveship`, `skill-book`, `utility-belt` — untouched. Note for whenever Ombo does adopt
  this: its `docs/packages.md` forbids new package boundaries without an ADR, and ADR 0003 assigns
  boundary ownership to `@ombo/contracts`, so adoption is an ADR amendment rather than a version bump.
- `utility-belt`'s Gherkin convention — copied into the new repo, not redefined.
- No code is copied from `ts-rest` or `oRPC`. They are read for API-shape inspiration only, which
  also keeps the licence position clean.

## Interfaces (frozen before any slice starts)

Slices code against these signatures. The owning slice implements them; others may read but not
change them without the lead amending this section.

### Error contract — slice 02

```ts
export interface RailIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

/** Plain serialisable data, so it survives a network hop between services. */
export interface RailError<TCode extends string = string> {
  readonly code: TCode;
  readonly message: string;
  readonly issues?: readonly RailIssue[];
  readonly cause?: RailError;   // downstream error, preserved verbatim
  readonly origin?: string;     // which service produced it
  readonly retryable?: boolean;
  readonly nextStep?: string;   // actionable hint for the caller, agent or human
}

export function railError<TCode extends string>(
  code: TCode,
  message: string,
  extra?: Omit<RailError<TCode>, 'code' | 'message'>,
): RailError<TCode>;

/** Wrap a downstream error as the cause of a caller-facing one. */
export function chain<TCode extends string>(
  outer: Omit<RailError<TCode>, 'cause'>,
  cause: RailError,
): RailError<TCode>;

export function flatten(error: RailError): readonly RailError[];   // root-first
export function formatChain(error: RailError): string;             // one line per hop

export type StatusMap<TCode extends string> = { readonly [K in TCode]: number };

export function statusFor<TCode extends string>(
  map: StatusMap<TCode>,
  error: RailError<TCode>,
): number;

/** Undeclared statuses degrade to 500 rather than leaking an undeclared shape. */
export function toDeclaredResponse<TCode extends string, TStatus extends number>(
  error: RailError<TCode>,
  map: StatusMap<TCode>,
  declared: readonly TStatus[],
): { status: TStatus | 500; body: RailError<TCode> };

export type Disclosure = 'full' | 'internal' | 'public';

/**
 * full     — everything, including the cause chain and nextStep (same trust circle)
 * internal — code, message, issues, nextStep; cause chain dropped
 * public   — code and a safe message; nextStep kept only when advisory, not diagnostic
 */
export function disclose<TCode extends string>(
  error: RailError<TCode>,
  level: Disclosure,
): RailError<TCode>;

export interface RespondOptions<TCode extends string, TSuccess extends number, TStatus extends number> {
  readonly success: TSuccess;
  readonly statuses: StatusMap<TCode>;
  readonly declared: readonly TStatus[];
  readonly disclosure?: Disclosure;   // defaults to 'full'
}

export function respond<TValue, TCode extends string, TSuccess extends number, TStatus extends number>(
  result: Result<TValue, RailError<TCode>>,
  options: RespondOptions<TCode, TSuccess, TStatus>,
): { status: TSuccess; body: TValue } | { status: TStatus | 500; body: RailError<TCode> };
```

### Contract definition — slice 03

Plain interfaces, plain object literals, `satisfies` at the call site. No builder, no generic
accumulation across chained calls.

```ts
import type { StandardSchemaV1 } from '@standard-schema/spec';

export interface RouteDef {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;                       // '/users/:id'
  readonly input?: StandardSchemaV1;
  readonly output: StandardSchemaV1;
  readonly errors: readonly string[];          // RailError codes this route may return
  readonly summary?: string;
}

export interface ContractDef {
  readonly [operation: string]: RouteDef;
}

// Consumers write, with no wrapper call at all:
//   export const contract = { getUser: { ... } } satisfies ContractDef;

export type InputOf<TRoute extends RouteDef> =
  TRoute['input'] extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<TRoute['input']> : undefined;

export type OutputOf<TRoute extends RouteDef> = StandardSchemaV1.InferOutput<TRoute['output']>;

export type ErrorOf<TRoute extends RouteDef> = RailError<TRoute['errors'][number]>;

/** Validate through any Standard Schema validator, mapping issues onto RailIssue. */
export function parseInput<TRoute extends RouteDef>(
  route: TRoute,
  value: unknown,
): ResultAsync<InputOf<TRoute>, RailError<'validation_error'>>;
```

### Server — slice 04

```ts
export type Handler<TRoute extends RouteDef, TContext> = (
  args: { input: InputOf<TRoute>; params: Record<string, string>; request: Request; context: TContext },
) => ResultAsync<OutputOf<TRoute>, ErrorOf<TRoute>> | Promise<Result<OutputOf<TRoute>, ErrorOf<TRoute>>>;

export type Handlers<TContract extends ContractDef, TContext> = {
  readonly [K in keyof TContract]: Handler<TContract[K], TContext>;
};

export interface ServeOptions<TCode extends string> {
  readonly statuses: StatusMap<TCode>;
  readonly disclosure?: Disclosure | ((request: Request) => Disclosure);
  readonly origin?: string;          // stamped onto RailError.origin for bubbling
}

export function serve<TContract extends ContractDef, TContext>(
  contract: TContract,
  handlers: Handlers<TContract, TContext>,
  options: ServeOptions<string>,
): (request: Request, context: TContext) => Promise<Response>;
```

### Client — slice 05

```ts
export interface ClientOptions {
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
  readonly headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
}

/**
 * One mapped type over the contract, one level deep, resolving to a plain function type per
 * operation. No recursion, no conditional chains. This is the shape slice 06 must keep honest.
 */
export type Client<TContract extends ContractDef> = {
  readonly [K in keyof TContract]: (
    input: InputOf<TContract[K]>,
  ) => ResultAsync<OutputOf<TContract[K]>, ErrorOf<TContract[K]>>;
};

export function createClient<TContract extends ContractDef>(
  contract: TContract,
  options: ClientOptions,
): Client<TContract>;
```

Two things the client must get right, both of which are why oRPC's design does not satisfy the brief:
network and parse failures become `Err(RailError)` rather than throwing, and the returned
`ResultAsync` composes — `client.getUser(id).andThen(loadOrders).map(toSummary)` must typecheck.

## Decisions for humans

- **npm org `@eddy-works` may not exist.** `npm whoami` returns E401, so it could not be checked.
  Needs `npm login`, then confirm or create the org and confirm public access.
- **GitHub org is `project-eddy`** (display name "Eddy Works"), not `eddy-works`. `repository.url`
  must match the real repo exactly or npm rejects the publish. All existing public repos there are
  forks, so this is genuinely Eddy Works' first first-party published package.
- **Licence: MIT or Apache-2.0.** No longer constrained by ts-rest or neverthrow's MIT since we take
  no code from either. Apache-2.0's patent grant is the safer company-backed default; MIT is lower
  friction for adoption.
- **Does the package ship a default status table**, or must every consumer supply a `StatusMap`?
  A default is friendlier but bakes in an opinion about what `conflict` means.
- **Overlap with LiveShip `module-kit`.** LiveShip's handover notes name its `module-kit` railway as
  the intended OSS extraction. Confirm it merges here rather than becoming a competing package.
- **`npmrc-test/.npmrc` contains a live token.** Do not copy any `.npmrc` into this repo. Trusted
  publishing needs no token.

## Coordination brief

| Slice | Objective | Owns (exclusive) | Must not touch | Interfaces exposed | Interfaces consumed | After |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Repo, toolchain, CI, release | `package.json`, `pnpm-lock.yaml`, `tsconfig*.json`, `eslint.config.mjs`, `vitest.config.ts`, `.gitignore`, `.editorconfig`, `LICENSE`, `.github/**` | `src/**`, `README.md`, `docs/**`, `specs/**`, `perf/**` | script names: `lint`, `typecheck`, `test`, `build`, `perf:check`, `specs:extract` | — | — |
| 02 | Error contract | `src/error.ts`, `src/status.ts`, `src/disclose.ts`, `src/respond.ts`, `src/index.ts`, matching `*.test.ts` | `src/contract/**`, `src/server/**`, `src/client/**`, `package.json` | the Error contract block | — | 01 |
| 03 | Contract types + Standard Schema validation | `src/contract/**` | `src/error.ts`, `src/server/**`, `src/client/**`, `package.json` | the Contract definition block | `RailError`, `RailIssue` from 02 | 01 |
| 04 | Server: Web-standard fetch handler + router | `src/server/**` | `src/contract/**`, `src/client/**`, `src/error.ts`, `package.json` | the Server block | 02, 03 | 01, 02, 03 |
| 05 | Client: Result-returning typed client | `src/client/**` | `src/contract/**`, `src/server/**`, `src/error.ts`, `package.json` | the Client block | 02, 03 | 01, 02, 03 |
| 06 | Type-performance budget + CI gate | `perf/**`, `scripts/typeperf.mjs`, `docs/performance.md` | `src/**`, `package.json` | published per-route budget | 02, 03, 04, 05 | 01, 04, 05 |
| 07 | Gherkin specs + extraction | `specs/**`, `scripts/extract-gherkin.mjs` | `src/**`, `docs/**`, `package.json` | runnable scenarios | declared interfaces only | 01 |
| 08 | Docs + agent skill | `README.md`, `docs/**` except `docs/performance.md`, `skills/never-rest/SKILL.md` | `src/**`, `specs/**`, `perf/**`, `package.json` | doc-index skill | declared interfaces only | 01 |
| — | Example gateway (lead, at integration) | `examples/**` | — | end-to-end proof | 02, 03, 04, 05 | 04, 05 |

Contested files and their single owner:

- `package.json`, `pnpm-lock.yaml`, `tsconfig*.json`, `.github/**` → **slice 01**. Every other slice
  requests scripts and dependencies in writing in its report; none of them edit these.
- `src/index.ts` → **slice 02**, and it exports the error contract *only*. Slices 03, 04 and 05 each
  own their own barrel (`src/contract/index.ts`, `src/server/index.ts`, `src/client/index.ts`) reached
  through the subpath exports, so no slice ever edits another's barrel and the root entry point stays
  dependency-free.
- `README.md` → **slice 08**. Slice 01 must not create even a placeholder.
- `docs/performance.md` → **slice 06**, carved out of slice 08's `docs/**`.

Ordering: slice 01 lands first and alone, because nothing runs until the toolchain exists. Then 02,
03, 07 and 08 run in parallel. Then 04 and 05. Then 06, which needs something real to measure.
Finally the lead builds `examples/` and runs the full validation list.

## Slice 01: repo, toolchain, CI, release

Objective: a repo where `pnpm install && pnpm test` works and a version tag publishes to npm.

Steps:

1. `package.json` for `@eddy-works/never-rest`, `"type": "module"`, `"sideEffects": false`,
   `files: ["dist"]`, `publishConfig.access: "public"`, and `repository.url` matching the real repo
   exactly. Exports map: `"."`, `"./contract"`, `"./server"`, `"./client"`.
2. Dependencies: **none at runtime**. `neverthrow` as a required peer. `@standard-schema/spec` as a
   types-only dependency. Dev only: TypeScript, vitest, lint, `@ark/attest`, `publint`, `attw`.
3. Strict `tsconfig.json` (`moduleResolution: nodenext`, `declaration`, `declarationMap`), plus
   `tsconfig.build.json` excluding tests, specs and perf.
4. Vitest, lint, and the six scripts in the coordination brief. `perf:check` may shell out to a
   script slice 06 owns; stub it to exit 0 with a TODO so CI is green before 06 lands.
5. `.github/workflows/ci.yml` running lint, typecheck, test, build, `publint`, `attw`.
6. `.github/workflows/release.yml` adapted from
   `liveship/packages/liveship-context-prune/.github/workflows/release.yml`: tag trigger,
   `id-token: write`, tag-matches-version check, then `npm publish --access public`.
   **Two corrections to the copied workflow:** provenance is automatic under OIDC trusted publishing,
   so do *not* pass `--provenance`; and classic tokens were permanently revoked in December 2025, so
   trusted publishing is the only viable path.
7. `LICENSE` per the human decision above.

Acceptance checks: `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` succeed
on an empty `src/index.ts`; `publint` and `attw --pack` pass on the built package; the release
workflow parses (`actionlint` or a dry-run job).

## Slice 02: error contract

Objective: implement the Error contract block with zero runtime dependencies.

Steps:

1. `src/error.ts` — `RailError`, `railError`, `chain`, `flatten`, `formatChain`. Chains must survive
   `JSON.parse(JSON.stringify(e))` unchanged; that is what makes cross-service bubbling work.
2. `src/status.ts` — port `statusFor` and `toDeclaredHttpResponse` from
   `ombo/apps/web/src/lib/server/http-errors.ts`, parameterised by `StatusMap<TCode>` rather than
   Ombo's hard-coded code union.
3. `src/disclose.ts` — the three levels. `public` must not leak `cause`, `origin`, or any `issues`
   path that reveals internal field names.
4. `src/respond.ts` — port `respond` from `ombo/.../respond.ts`, adding the `disclosure` option.
5. `src/index.ts` — explicit named re-exports only, no `export *`, so the public surface stays
   greppable and tree-shakeable.

Acceptance checks: every export covered by tests, including the ported case asserting an undeclared
status degrades to 500; a round-trip serialisation test on a three-deep cause chain;
`disclose(e, 'public')` asserted to contain no substring from a nested cause's internal message.

## Slice 03: contract types and Standard Schema validation

Objective: a contract that is a plain object literal, and validation that works with any Standard
Schema validator.

Steps:

1. `src/contract/types.ts` — `RouteDef`, `ContractDef`, `InputOf`, `OutputOf`, `ErrorOf`. Use
   `interface` rather than intersections; keep every helper a single-level indexed access or
   conditional. No recursion anywhere.
2. `src/contract/parse.ts` — `parseInput`, calling `schema['~standard'].validate` and mapping
   Standard Schema `Issue[]` onto `RailIssue[]`. Handle the sync-or-promise return the spec allows.
3. `src/contract/path.ts` — compile `'/users/:id'` into a matcher plus param names. Exact segments
   and single `:param` segments only.
4. Type tests proving `satisfies ContractDef` rejects a missing `output`, an unknown method, and an
   error code absent from `errors`.
5. Verify against **three** validators — Zod 4, Valibot and ArkType — to prove there is no lock-in.

Acceptance checks: identical `parseInput` behaviour across all three validators; a malformed input
produces `Err` with populated `issues` and never throws; `pnpm typecheck` clean.

## Slice 04: server

Objective: `serve(contract, handlers, options)` returning a Web-standard fetch handler.

Steps:

1. `src/server/router.ts` — match method plus compiled path in declaration order; unmatched returns
   404 as a `RailError`.
2. `src/server/serve.ts` — parse input via slice 03, call the handler, feed the `Result` through
   `respond` from slice 02, serialise to a `Response` with `content-type: application/json`.
3. Stamp `options.origin` onto outgoing `RailError.origin` when absent, so a gateway can see which
   service produced each hop.
4. Resolve `disclosure` per request when it is a function, so a trusted internal caller and a public
   one get different detail from the same handler.
5. A thrown exception inside a handler is caught and becomes a 500 `RailError` with the original
   message under `cause` — never an unhandled rejection, never a leaked stack in `public`.

Acceptance checks: a table-driven test over methods, params, validation failure, declared error,
undeclared error and thrown exception; runs unmodified under Node and `workerd`; a request with two
chained downstream failures returns a two-deep `cause` chain.

## Slice 05: client

Objective: `createClient(contract, options)` returning composable `ResultAsync` per operation.

Steps:

1. `src/client/create.ts` — build one function per contract key. Interpolate path params from input,
   send the remainder as a JSON body or query string by method.
2. Map the response: 2xx parses through the route's `output` schema into `Ok`; a JSON `RailError` body
   becomes `Err`; a non-JSON or unparseable response becomes `Err(railError('internal', ...))`;
   a network throw becomes `Err(railError('unavailable', ...))` with `retryable: true`.
3. Never throw. Every failure path returns `Err`.
4. Type tests proving `client.getUser(...).andThen(...).map(...)` typechecks and that a code absent
   from the route's `errors` is not assignable to the error channel.

Acceptance checks: tests against slice 04's handler in-process via a `fetch` stub; a composition test
chaining two calls where the first fails and the second is provably never invoked; no `throw`
statement anywhere in `src/client/`.

## Slice 06: type-performance budget and CI gate

Objective: make the headline claim a published, enforced number rather than an assertion.

Steps:

1. `perf/fixtures/` — synthetic contracts at 1, 5, 20 and 40 routes, plus a matching
   `plain-object.ts` control, so the per-route slope is measurable and not just a total.
2. Use **`@ark/attest`**: `attest.instantiations([N, "instantiations"])` with
   `ATTEST_benchErrorOnThresholdExceeded`, as arktype wires into its own `prChecks`. This is the only
   established convention; zod's harness is private, oRPC benches runtime only, ts-rest has none.
3. Measure and commit the slope for contract definition, `serve`, and `Client` separately, so a
   regression points at a module rather than a total.
4. `perf/baseline.json` recording the TypeScript version. TS 7.0.2 is 8–12× faster in wall clock but
   structurally identical in checking, so instantiation counts stay comparable while timings do not.
5. `docs/performance.md` — the numbers, the reproduction method, and a like-for-like comparison
   against `@ts-rest/core` at the same route counts. Research anchors: ts-rest ~5,984 per route
   (20 routes = 144,884); plain object literals ~1,193 per route (20 routes = 23,865). **Budget: stay
   under 1,800 instantiations per route**, i.e. within ~1.5× of plain literals and at least 3× cheaper
   than ts-rest.
6. Also wire `tsc --generateTrace` plus `@typescript/analyze-trace` as an on-demand diagnostic script,
   not part of the gate — too slow and noisy for CI.
7. Add the gate to `ci.yml` by requesting the edit from slice 01 rather than editing it.

Acceptance checks: `pnpm perf:check` passes on the committed baseline and fails when a deliberate
recursive conditional type is introduced into a fixture; `docs/performance.md` states measured numbers
with the compiler version; if the 1,800 budget cannot be met, that is a design finding to escalate,
not a number to raise quietly.

## Slice 07: Gherkin specs and extraction

Objective: the rule-shaped behaviour is specified in prose both agents and tests can read.

Steps:

1. Copy `utility-belt/mixins/gherkin/scripts/extract-gherkin.mjs` and follow
   `utility-belt/mixins/gherkin/SKILL.md` — markdown specs, one `When` per scenario.
2. `specs/status-mapping.md` — declared vs undeclared statuses, the 500 degradation, custom maps.
3. `specs/graded-disclosure.md` — what each level reveals and, more importantly, what it must never
   reveal. This is the security-relevant spec, so enumerate the leak cases explicitly.
4. `specs/cause-chaining.md` — a downstream error bubbling through a gateway, chain order,
   `origin` stamping, serialisation round-trip.
5. `specs/client-results.md` — declared error becomes `Err`, undeclared becomes `Err(internal)`,
   network failure becomes retryable `Err`, 2xx becomes `Ok`, and chains short-circuit.
6. `specs/README.md` — how to run extraction and where scenarios land.

Acceptance checks: `pnpm specs:extract` produces scenarios for every `When`; each maps to a named
test; no scenario describes type-level behaviour, which belongs to slice 06.

## Slice 08: docs and agent skill

Objective: a README that earns adoption, and a skill that is an index rather than a workflow.

Steps:

1. `README.md` — the problem in five lines, a 20-line quickstart, the published type budget linking
   to `docs/performance.md`, and an honest "when not to use this" naming ts-rest and oRPC as the
   alternatives with what each does better.
2. `docs/concepts.md` — railway at a boundary; errors as data; the trust-circle argument for
   transparency, and why graded disclosure exists rather than blanket obfuscation.
3. `docs/api.md` — every export, signature and one example.
4. `docs/errors-as-intelligence.md` — `nextStep`, `origin`, `retryable`, and how a gateway composes a
   chain an agent can act on.
5. `docs/comparison.md` — against ts-rest and oRPC. State plainly that oRPC's server model is
   throw-based and its `safe()` result does not compose, and that ts-rest's contract DSL costs ~5×
   more per route. Cite versions and dates so the claims stay checkable and age visibly.
6. `docs/migrating.md` — from ts-rest, from oRPC, and from throwing handlers.
7. `skills/never-rest/SKILL.md` — a lookup index shaped like
   `~/.cursor/skills/codebase-design/SKILL.md`: a table of question → doc anchor. No procedure, no
   numbered workflow.

Acceptance checks: every code sample is copied from a passing test or is itself typechecked; every
link resolves; the index covers every public export and every spec file; the skill contains no
imperative workflow steps.

## Riskiest slice

Slice 06, and the risk is that it disproves the thesis. The whole pitch is now a published per-route
budget, so if the hand-written contract plus a one-level mapped `Client` type cannot come in under
~1,800 instantiations per route, the differentiator evaporates and the library is competing on taste
alone against two mature alternatives. That is worth knowing early, so **build a throwaway spike of
slices 03 and 05 and measure it before committing to the full build.**

Slice 05 is second: `Client<TContract>` is the one mapped type over the whole contract, which is
exactly the construct that makes tRPC-style APIs slow. Keeping it one level deep with no recursion is
the constraint that must not be relaxed for convenience.

## Handoff to `eng-team-implement`

Spike slices 03 and 05 and run the slice 06 measurement first — one agent, throwaway branch, one
question: does the design come in under budget? If yes, land slice 01 alone, then 02, 03, 07 and 08 in
parallel, then 04 and 05, then 06, then the lead builds `examples/`. Give every implementer the whole
coordination brief table, not just their own row.
