# Plan: The protocol cannot lie (0.4)

Mission: Close the edge-integrity holes that let 0.3.0 break its own guarantees — schema input/output semantics, uncaught library throws, forged `internal`, silent wire mangling, non-authoritative compilation — and re-present the library as what it is: an opinionated architecture that puts railway-oriented programming at the API boundary.

Definition of done:

- A transforming input schema types, validates, and serializes correctly on both sides; output schemas have a stated transport-stability rule, a shipped way to test compliance with it, and docs that stop advertising arbitrary output transforms.
- No library-controlled code path can throw or hang out of a `serve()` handler or a client call — including header callbacks, disclosure callbacks, body reads, serialization, and cyclic cause chains.
- A handler cannot put an attacker-visible string on the public wire by forging a reserved error code; the client cannot be made to copy an untrusted remote message into its own `internal`.
- Path values round-trip byte-for-byte; unrepresentable query values produce an explicit error instead of vanishing; `compileContract` is the single normalized representation both sides use.
- Coverage is gated in CI, a real HTTP round-trip test exists, docs/README lead with the architectural opinion, and every published example link resolves on the deployed site.

Validation:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm perf:check && pnpm build \
  && pnpm specs:lint && pnpm docs:build && pnpm examples:typecheck && pnpm examples:smoke \
  && pnpm exec publint && pnpm exec attw --pack --profile esm-only
```

Size budget: 48–58 files touched (6 new: `src/testing/index.ts`, `src/testing/transport.ts`, `src/testing/transport.test.ts`, `src/round-trip.test.ts`, `specs/contract-compilation.spec.md`, `specs/wire-serialization.spec.md`); roughly +1,600/−400 lines. Exceeding ~60 files triggers re-scoping — the likeliest overrun is docs, so cut slice 05 scope before cutting protocol work. **6 slices; slices 01–04 are release-blocking, 05–06 can ship as 0.4.1 if time is short.**

Baseline before any change (measured 2026-08-12, dirty tree): `lint`, `typecheck`, `test` (88 tests / 11 files), `perf:check` (584/route against an 1,800 budget), `build`, `docs:build`, `examples:typecheck`, `examples:smoke`, `specs:lint`, `publint`, `attw` — **all pass**. Coverage is 87.96% statements / 81.66% branches and is not gated.

## Verdicts on the review

Four scouts checked every claim with runnable repros. The review is largely right, but three claims are narrower than stated and one recommendation should be rejected. The scratch repros were written under a gitignored path, so every verified case is recorded in the appendix at the end of this plan — that table, not `.tmp/`, is the source for the tests each slice must write.

| Claim | Verdict | Evidence |
| --- | --- | --- |
| 1 — `InputOf` uses `InferOutput`, so transforming input schemas are contradictory | **Confirmed** | `src/contract/types.ts:17-19`. Client typed `{limit: number}` fails its own `parseInput` with "expected string, received number". A GET route with `z.number().default(10)` is broken end-to-end: client applies the default, query sends `"10"`, server rejects. |
| 1b — output transforms are unsafe applied twice | **Confirmed, worse than stated** | Server parses handler output then serializes the parsed value; client re-parses the JSON with the same schema. `z.number().transform(String)` → wire `{"score":"42"}` → client returns `internal: Response validation failed`. An ISO-string→Date schema survives only by luck. |
| 2 — "never throws" is incomplete | **Partly confirmed** | Handler throws *are* caught (`serve.ts:218-227`) and fetch *is* protected. Still escaping: sync `headers()` throw, `buildRequest`'s `new Headers()` / `JSON.stringify` (POST), `await request.text()` rejection, a throwing `disclosure` callback, `jsonResponse`'s `JSON.stringify`, and `stampOrigin` on a cyclic cause. |
| 2b — cyclic cause chains | **New, not in the review** | `stampOrigin` (`serve.ts:94-96`) recurses to a stack overflow; `flatten` (`error.ts:40-49`) and `collectCauseMessages` (`disclose.ts:14-24`) loop forever. A `try`/`catch` fail-safe cannot rescue the infinite loops. |
| 3 — handler-supplied `internal` is trusted | **Partly confirmed, and it does leak** | `serve.ts:164` exempts only `internal`; forged `validation_error` and `route_not_found` are already wrapped. Proof-of-concept body at the default `public` disclosure: `{"code":"internal","message":"postgres://admin:secret@db.internal"}`, because `disclose` keeps the root message verbatim (`disclose.ts:75-77`). |
| 3b — the client has the mirror-image bug | **New, not in the review** | `mapProtocolError` (`client/response.ts:173-177`) passes a remote `internal` / `validation_error` through untouched and, for unknown codes, copies the untrusted remote message into the *outer* error message. |
| 4a — path values do not round-trip | **Confirmed** | Client encodes (`request.ts:18`), `matchPath` returns the raw capture (`path.ts:44`). Handler receives `hello%20world`, `a%2Fb`, `caf%C3%A9`. A naive fix introduces a new throw: `decodeURIComponent('%zz')` raises `URIError`. |
| 4b — missing path params do not fail | **Partly confirmed** | The input schema blocks the common required case before fetch. The real gaps are `''` (produces `/users/`) and optional params (leaves a literal `:id` in the URL). |
| 4c — query serialization silently drops data | **Confirmed** | `toQueryString` emits only string/number/boolean (`request.ts:30-36`). Worst case reproduced: `z.array(z.string())` passes client validation, the query goes out empty, and the server answers `validation_error` — the contract data vanished between two validators that both said yes. |
| 5 — `compileContract` is not authoritative | **Partly confirmed** | Result is computed then discarded (`serve.ts:236`, `create.ts:77`); `compilePath` runs on every request (`request.ts:95`). Literal-string duplicate check misses `:id`/`:userId`, `/users` vs `/users/`, and `/a/:id/b/:id`. A non-function handler passes construction and 500s at request time. |
| 5b — flag `/users/:id` vs `/users/me` overlaps | **Rejected** | Static-before-dynamic is intentional and documented (`docs/concepts.md:85`, `docs/api.md:349`). Erroring would break the most common routing idiom. Document it; do not detect it. |
| 6 — the README quickstart loses its literal types | **Confirmed, with teeth** | Without `as const`, `errors` widens to `string`, `ServeStatusMap` accepts any key, and a status map missing `not_found` compiles clean. 10 consumer sites lack `as const`; zero use it today. |

Also found, outside the review: `specs:lint` runs in the pre-commit hook but not in CI; the release workflow publishes without running lint/test/perf; `perf:check` hard-fails unless `tsc --version` is exactly 5.9.3 while `package.json` allows `^5.8.3`; and all 11 `../examples/*` links on the deployed docs site return 404.

## Changes from the review

| Review says | Plan says | Rationale |
| --- | --- | --- |
| Fix requests with `ClientInputOf` / `HandlerInputOf`; "responses are trickier", make response schemas transport-stable | Split the input types exactly as proposed. For output, state the transport-stability rule in docs and ship a *test-time* helper — no runtime enforcement | Transform-instability cannot be detected generically at runtime without parsing twice on every response. A rule plus a way to test it is honest; a half-check is not. |
| Add an ultimate server fail-safe returning a constant JSON string | Adopt verbatim, **and** add cycle guards to `stampOrigin`, `flatten`, `collectCauseMessages` | A `try`/`catch` catches the stack overflow but not the infinite `while` loops. The fail-safe alone leaves a hang. |
| `normalizeHandlerError` should have no exception for `internal` | Adopt, **and** stop the client copying untrusted remote messages in `mapProtocolError` | Same trust bug, other side of the wire. Fixing only the server leaves gateways exposed. |
| `matchPath()` should decode each capture safely | Decode, and make an undecodable capture an explicit `validation_error` rather than falling back to the raw string | A silent raw-value fallback is the same class of lie we are removing. Requires a breaking change to `matchPath`'s return type — see decision D4. |
| Missing path parameters should become a protocol error | Adopt, but scope it to what is actually reachable: empty string and optional params | The schema already blocks required-and-missing. Claiming otherwise would have us write a test that cannot fail. |
| Query: "either support a shape or return an explicit error" | Support arrays of primitives as `key[]=a&key[]=b`; explicit error for everything else | Arrays are the common case. Bare repeated keys are ambiguous for single-element arrays; the `[]` suffix is not. |
| Detect route overlaps such as `/users/:id` vs `/users/me` | Do not detect. Detect duplicate compiled matchers, duplicate param names, and trailing-slash collisions only | Static-before-dynamic is an intentional, documented idiom. Erroring on it breaks correct contracts. |
| Benchmark a `defineContract()` const-generic identity helper | 0.4 documents `as const satisfies ContractDef` only; `defineContract` deferred behind a measured bench | Shipping a public API before measuring contradicts the published type budget. Note the benches themselves use the non-`as const` form, so the 584/route figure does not currently cover the recommended style. |
| 0.5 = params / query / body | Unchanged — still out of scope | Explicit input-source separation is a larger design; the wire fixes here make it easier, not harder. |
| (silent on docs, website, tests) | Slices 04–06 add coverage gating, a real HTTP round-trip test, the architectural framing, and the website link fix | Directly requested. |

## Reuse

| Capability | Existing artifact | Verdict | Why |
| --- | --- | --- | --- |
| Client vs handler input types | `src/contract/types.ts` → `InputOf` | extend | Add `ClientInputOf` / `HandlerInputOf`; keep `InputOf` as a deprecated alias of the handler side. |
| Safe schema parse | `src/contract/parse.ts` → `parseSchema` | reuse | Already try/catches and handles async validators. |
| Construction validation | `src/contract/compile.ts` → `compileContract` | extend | Add matcher-level duplicate detection and handler completeness; do not build a second compiler. |
| Path matching | `src/contract/path.ts` → `matchPath` | extend | Decode captures; widen the return type to carry decode failure. |
| Route table | `src/server/router.ts` → `compileRoutes` | extend | Reimplement over `CompiledContract` so it stays a public export but stops recompiling. |
| Bounded envelope parse | `src/client/response.ts` → `parseRailErrorEnvelope` | reuse | Depth bound of 16 already correct; the gap is downstream in `mapProtocolError`. |
| Error redaction | `src/disclose.ts` → `disclose` | extend | Levels and rules stay; add a cycle guard to cause walking. |
| Fetch throw protection | `src/client/create.ts` → `invokeFetch` | reuse | Established pattern for wrapping a throw-prone call; copy it for `resolveHeaders` and `buildRequest`. |
| Status map derivation | `src/server/types.ts` → `ServeStatusMap` | reuse | Already derives from the contract; the `as const` fix restores its teeth. |
| Website link rewriting | `website/lib/doc-link.tsx` → `normalizeBareMarkdownHref` | extend | The hook for href rewriting already exists; add an `../examples/` → GitHub rule beside it. |
| Docs deployment | `.github/workflows/docs.yml` | reuse | Builds and deploys `website/out` on push to `main`; `website/out` is gitignored. Nothing to build, just merge. |
| Spec ↔ test mapping | `specs/README.md`, `scripts/lint-gherkin.mjs` | reuse | 38 scenarios across 5 files with a title-for-title test map; new specs follow the same shape. |
| Round-trip test rig | `src/node/to-node-handler.test.ts` | extend | Already starts a real HTTP server; add `createClient` on the other end. |
| Transport-stability check | none | build new (`src/testing/`) | `parseSchema` validates one value in one direction; nothing in the codebase compares a parse against its own wire round trip, and no existing subpath is test-only. |
| Library protocol tests | `examples/smoke/protocol/**` | reuse, **relocated to `src/`** | These already test library behaviour against a throwaway local contract, not the examples. They are in the wrong place, not the wrong shape — see below. |
| Example conformance suite | `examples/smoke/{users-mounts.test.ts,scenarios/}` | reuse, **renamed to `examples/conformance/`** | The harness is sound; the name and location misrepresent it as a lesson. |
| Examples teaching the protocol | `plans/20260812-examples-protocol-teaching.md` (in flight) | reuse | Do not re-plan it; slice 06 only adds `as const` and the link fix on top. |

## The `examples/smoke` mislabel

Not from the review — found while reading the directory. `examples/smoke/` is not an example. It has no `package.json`, so it is the only thing under `examples/` that is not a workspace package and `examples:typecheck` cannot see it; it imports its subjects across package boundaries (`../express/src/handler.js`); and its "scenarios" are `expect()` calls parameterised by a `label` so they can be replayed against two mounts. It is the examples' test suite, sitting in a directory the README introduces as "runnable mini projects", with its own README offering a numbered "read order" as though it were a fifth lesson.

It also does two unrelated jobs. `users-mounts.test.ts` plus `scenarios/` guard the example apps, which belongs near the examples. `protocol/` stands up its own throwaway contract (`protocol/fixture.ts`) to test *library* behaviour — output parsing strips extra fields, undeclared handler codes become `internal`, a rejecting fetch yields `unavailable`. Those are never-rest's own tests in an example costume.

That misplacement has a measurement consequence this plan depends on. Smoke runs under `examples/smoke/vitest.config.ts`, which configures no coverage, and the root config excludes `**/examples/**`. CI does run `pnpm examples:smoke` (`ci.yml:73`), so the assertions execute — but they contribute nothing to the coverage report, so any `src/` line proven only there counts as uncovered. **The 87.96% / 81.66% baseline understates real coverage, and slice 04 must not set thresholds from it.**

Resolution, owned by slice 04: move `protocol/**` into `src/` as ordinary library tests (rewriting the `@eddy-works/never-rest/contract` import to a relative one, as other `src/` tests do), and rename what remains to `examples/conformance/` so the directory states its one job. Both depend on the in-flight examples work merging first, since `protocol/` is that agent's new, uncommitted code.

## What stays the same

- `params` / `query` / `body` input-source separation stays deferred to 0.5.
- Declaration-order route matching, including static-before-dynamic.
- `respond()` remains the low-level helper with its `full` default; only `serve()` defaults to `public`.
- Handler types stay domain-errors-only; the client keeps re-validating 2xx bodies.
- `disclose` levels (`full` / `internal` / `public`) and their redaction rules.
- No OpenAPI, middleware system, framework adapters, streaming, or multipart.
- `neverthrow` stays a peer dependency; `@standard-schema/spec` stays the only runtime dependency.
- `perf/benches/**` and `perf/baseline.json` are not touched by any slice (lead-reserved).

## Declared interfaces

Written before anyone starts; slices consume these by name.

**From slice 01 (`@eddy-works/never-rest/contract`):**

```ts
type ClientInputOf<R extends RouteDef> =
  R['input'] extends StandardSchemaV1 ? StandardSchemaV1.InferInput<R['input']> : undefined;
type HandlerInputOf<R extends RouteDef> =
  R['input'] extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<R['input']> : undefined;
/** @deprecated use HandlerInputOf */
type InputOf<R extends RouteDef> = HandlerInputOf<R>;

type PathMatch =
  | { readonly kind: 'match'; readonly params: Record<string, string> }
  | { readonly kind: 'miss' }
  | { readonly kind: 'invalid_encoding'; readonly param: string };

function matchPath(compiled: CompiledPath, pathname: string): PathMatch;
function assertHandlersComplete(compiled: CompiledContract<never>, handlers: object): void;
```

`compileContract` keeps its signature and gains matcher-duplicate, duplicate-param-name, and trailing-slash checks. `CompiledContract.routes[op].compiledPath` becomes the single compiled path both sides use.

**From slice 01, on a new `@eddy-works/never-rest/testing` subpath (decision D1):**

```ts
function checkTransportStability<T extends StandardSchemaV1>(
  schema: T,
  sample: StandardSchemaV1.InferInput<T>,
): ResultAsync<void, RailError<'transport_unstable'>>;
```

It parses `sample` to a value, JSON round-trips that value the way the wire does, parses the result again, and fails when the two parsed values differ or the second parse rejects. That is precisely the property `serve` and the client both rely on, and it is checkable only with a sample value — which is why this is a test helper and not a construction check. It lives on its own subpath so a test-only utility never enters a consumer's runtime surface.

**Query wire convention (binds slices 02 and 03 symmetrically):**

| Value | Wire | Server reads back |
| --- | --- | --- |
| `string` / `number` / `boolean` | `k=v` | scalar string |
| `Date` | `k=<ISO 8601>` | scalar string |
| array of the above | `k[]=a&k[]=b` (always suffixed, even for one element) | array of strings |
| `undefined` / `null` | omitted | absent |
| empty array | see decision D2 | — |
| nested object, `bigint`, function, symbol | **`validation_error` before fetch** | — |

**Failure codes introduced by slices 02 and 03** — all already members of `ClientErrorOf` / `ServeStatusMap`, so no new reserved code and no status-map migration:

| Situation | Code | Side |
| --- | --- | --- |
| Missing or empty path parameter | `validation_error` | client, pre-fetch |
| Unrepresentable query value | `validation_error` | client, pre-fetch |
| `new Headers()` / `JSON.stringify` throw | `internal` | client |
| Header callback throws or rejects | `internal` | client |
| Undecodable path capture | `validation_error` | server |
| `request.text()` rejects | `validation_error` | server |
| Disclosure callback throws | falls back to `public`, request continues | server |
| Anything else escaping the handler | `internal`, constant JSON body | server |

## Decisions for humans

None of these should be settled silently in code.

- **D1 — Output transform policy. RESOLVED:** document the transport-stability rule *and* ship a test-time helper so consumers can prove their own schemas comply. Runtime enforcement stays rejected. Remaining sub-choice for the implementer: the helper returns `Result<void, RailError<'transport_unstable'>>` rather than throwing, for consistency with the library's thesis — which means the name should read as a check (`checkTransportStability`) rather than an assertion. Flag it if you would rather it throw and keep the `assertTransportStable` name; test suites usually prefer a throw, so this is a real trade-off between ergonomics and consistency.
- **D2 — Empty arrays in GET queries.** No standard wire representation exists. Explicit `validation_error` telling the author to use POST or mark the field optional (consistent with the thesis, mildly annoying) versus omitting the key (`[]` and absent become indistinguishable — a silent lie of exactly the kind this release removes).
- **D3 — `as const satisfies` and the type budget.** The published 584/route figure is measured on the *non*-`as const` form. If `as const satisfies` becomes the documented style, either the benches change (and the headline number moves) or the budget stops describing the recommended style. Related: whether `defineContract()` is worth a measured bench for 0.5.
- **D4 — `matchPath` return type.** Making decode failure honest changes a public export's return type from `Record<string, string> | undefined` to a discriminated union. Acceptable breaking change at 0.x, or keep a compatibility overload?
- **D5 — Coverage gate.** What thresholds, and does CI run `test:coverage` on every PR or nightly? Raising coverage on `client/response.ts` (67%) means asserting some internal messages that are currently free to change.
- **D6 — Semver posture.** 0.4 is breaking for anyone using transforming input schemas, arrays in GET queries, percent-encoded path values, or a status map that only compiled because of literal widening. Ombo (ADR 0015) is the known consumer. Ship as a clean break with migration notes, or add compatibility shims?
- **D7 — The documented `internal` pattern.** `docs/railway-patterns.md:629` shows `mapErr(() => railError('internal', …))` inside handler pipelines. Removing the `internal` exemption means those messages get wrapped and hidden at `public` — which is the point of the fix, but it invalidates published guidance that people may have copied.

## Coordination brief

| Slice | Objective | Owns (exclusive) | Must not touch | Interfaces exposed | Interfaces consumed | After |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Contract foundation: input/output type split, safe path decode, authoritative compilation, transport-stability helper | `src/contract/types.ts`, `types.test-d.ts`, `parse.ts`, `parse.test.ts`, `path.ts`, `path.test.ts`, `compile.ts`, `compile.test.ts`, `index.ts`, `src/server/router.ts`, `router.test.ts`, `src/testing/**` (new), `specs/contract-compilation.spec.md` (new) | `src/client/**`, `src/server/serve.ts`, docs, examples, CHANGELOG | `ClientInputOf`, `HandlerInputOf`, `PathMatch`, widened `matchPath`, `assertHandlersComplete`, richer `compileContract`, `checkTransportStability` | `StandardSchemaV1`, `railError` | – |
| 02 | Client wire fidelity and throw safety | `src/client/request.ts`, `create.ts`, `create.test.ts`, `types.ts`, `types.test-d.ts`, `response.ts`, `index.ts`, `specs/client-results.spec.md`, `specs/wire-serialization.spec.md` (new) | `src/contract/**`, `src/server/**`, docs, examples, CHANGELOG | Query wire convention (client half), `Client` typed on `ClientInputOf` | `ClientInputOf`, `CompiledContract`, `parseInput` | 01 |
| 03 | Server fail-safe, forged-code normalization, cycle guards | `src/server/serve.ts`, `serve.test.ts`, `src/server/types.ts`, `src/server/index.ts`, `src/disclose.ts`, `disclose.test.ts`, `src/error.ts`, `error.test.ts`, `specs/graded-disclosure.spec.md`, `specs/server-output-validation.spec.md`, `specs/cause-chaining.spec.md`, `specs/status-mapping.spec.md` | `src/contract/**`, `src/client/**`, `src/respond.ts`, docs, examples, CHANGELOG | Query wire convention (server half), constant-body fail-safe | `HandlerInputOf`, `PathMatch`, `assertHandlersComplete`, `CompiledContract` | 01 |
| 04 | Test infrastructure: round-trip, coverage gate, CI gaps, smoke relocation | `src/round-trip.test.ts` (new), `vitest.config.ts`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `scripts/typeperf.mjs`, `examples/smoke/**` → `src/` + `examples/conformance/**`, and the seven READMEs linking `../smoke/README.md` (`examples/README.md`, `examples/validators/README.md`, and the express / hono / next-app-router / sveltekit / cloudflare-workers READMEs at line 19) | all `src/**` implementation, `docs/**`, `examples/**` other than the relocation and its broken links | Coverage thresholds, CI gates, `examples/conformance/` | everything from 01–03 | 02, 03, in-flight examples work |
| 05 | Docs and the architectural opinion | `README.md`, `docs/index.md`, `concepts.md`, `api.md`, `advanced-usage.md`, `comparison.md`, `errors-as-intelligence.md`, `migrating.md`, `performance.md`, `railway-patterns.md`, `specs/README.md`, `skills/never-rest/SKILL.md`, `CHANGELOG.md` | `src/**`, `website/**`, `examples/**`, `docs/examples.md` | Migration notes, the framing | public API from 01–03 | 02, 03 |
| 06 | Website links and the `as const` sweep | `docs/examples.md`, `website/lib/doc-link.tsx`, `website/app/(home)/page.tsx`, `examples/packages/shared-contract/src/contract.ts`, `examples/validators/src/contracts/{zod,valibot,arktype}.ts`, `examples/gateway/src/run.ts` | `src/**`, `docs/**` except `examples.md`, `README.md`, CHANGELOG, `examples/smoke/**` | Working example links | – | in-flight examples work merging |

Contested files and their single owner:

- `src/contract/index.ts` → slice 01. Slices 02 and 03 request exports in their report rather than editing it.
- `src/server/router.ts` → slice 01 (it is pure matching), even though it lives under `server/`. Slice 03 consumes it.
- `docs/examples.md` → slice 06 only. Slice 05 owns the README examples table instead.
- `CHANGELOG.md` → slice 05. Every other slice writes its bullet into its final report; slice 05 merges them. The CI gate only needs the file touched once per PR.
- `package.json`, `pnpm-lock.yaml`, `perf/baseline.json`, `perf/benches/**` → **lead reserved**. Slices request changes; nobody edits. One such request is already known: when slice 01 lands, the lead adds the `./testing` subpath to `exports` and `typesVersions`, then re-runs `publint` and `attw`, which gate the export map.
- `src/respond.ts`, `src/status.ts`, `src/index.ts` → **lead reserved** (no planned change; if slice 03 needs one, it asks).
- `examples/**` beyond the `as const` sweep → the in-flight examples agent. Slice 06 starts only after that work merges.

Ordering: 01 and 06 can start immediately and in parallel. 02 and 03 start when 01 lands. 04 and 05 start when 02 and 03 land.

## Slice 01: Contract foundation

Objective: make the contract layer tell the truth about types, paths, and duplicates, and become the one compiled representation.

Steps:

1. Add `ClientInputOf` (`InferInput`) and `HandlerInputOf` (`InferOutput`); redefine `InputOf` as a deprecated alias of `HandlerInputOf`.
2. Type tests proving the split: for `z.object({ limit: z.string().transform(Number) })`, `ClientInputOf` is `{ limit: string }` and `HandlerInputOf` is `{ limit: number }`; for a route with no `input`, both are `undefined`.
3. Decode path captures in `matchPath` and widen its return to `PathMatch`. An undecodable capture yields `{ kind: 'invalid_encoding', param }`, never a throw and never a raw fallback.
4. Normalize trailing slashes in `compilePath` so `/users` and `/users/` produce one matcher, and reject duplicate parameter names within a path at compile time.
5. In `compileContract`, detect duplicate *compiled matchers* per method (comparing `regex.source`, so `:id` and `:userId` collide) in addition to the existing literal check. Keep the error messages naming both operations.
6. Add `assertHandlersComplete(compiled, handlers)` — every operation key maps to a function — as a pure function here, called by slice 03.
7. Reimplement `compileRoutes` over `compileContract` so the route table is built once; keep the export and its signature.
8. Add `src/testing/` with `checkTransportStability` per decision D1, plus tests proving it passes an ISO-string-to-`Date` schema and fails `z.number().transform(String)` — the exact case that breaks the client today.
9. Write `specs/contract-compilation.spec.md` covering duplicate matchers, duplicate param names, trailing-slash collision, reserved codes, and missing handlers. Satisfy `pnpm specs:lint`.

Acceptance checks:

- `pnpm exec vitest run src/contract src/server/router.test.ts` and `pnpm typecheck` pass.
- A round-trip unit test proves `matchPath` returns decoded `hello world`, `a/b`, `café` for the corresponding encoded pathnames, and `invalid_encoding` for `%zz`.
- No file under `src/client/` or `src/server/serve.ts` modified.

## Slice 02: Client wire fidelity

Objective: the client sends exactly what the contract says, or explains why it cannot — and never throws.

Steps:

1. Retype `Client` methods and `callRoute`'s `input` on `ClientInputOf`. Client-side `parseInput` now validates the raw input, which is what the schema actually expects.
2. Change `buildRequest` to return `Result<BuiltRequest, RailError<'validation_error' | 'internal'>>`. Move `new Headers()` and `JSON.stringify` inside that boundary.
3. Wrap `resolveHeaders` so a synchronous throw becomes `internal` (a rejected promise already maps to `unavailable`; keep that).
4. Fail with `validation_error` when a declared path parameter is missing, `undefined`, `null`, or empty — before fetch. Name the parameter in the issue.
5. Implement the query convention from **Declared interfaces**: primitives and `Date` as scalars, arrays of primitives as `k[]=`, explicit `validation_error` for anything unrepresentable. Honour decision D2 for empty arrays.
6. Use `compiledContract.routes[key].compiledPath` instead of calling `compilePath` per request.
7. In `mapProtocolError`, stop copying the remote message into the outer error: an unknown remote code becomes `internal` with a constant message and the remote error preserved as `cause`.
8. Extend `specs/client-results.spec.md` and write `specs/wire-serialization.spec.md`.

Acceptance checks:

- Every slice 02 row in the appendix is a passing test: array in a GET query arrives intact; nested object errors before fetch; missing path param errors before fetch; `fetch` is provably not called in those cases.
- A throwing header callback, a circular POST body, and an invalid header value each return an `Err`, with no unhandled rejection.
- `pnpm exec vitest run src/client && pnpm typecheck && pnpm perf:check`. If the slope rises, simplify the type aliases before asking the lead to touch the baseline.

## Slice 03: Server cannot be made to lie

Objective: nothing escapes the railway, and no handler can forge its way onto the public wire.

Steps:

1. Wrap the whole returned handler in `try`/`catch`. The catch returns a **constant** JSON string body at `statuses.internal` — no interpolation, no serialization that could itself fail.
2. Remove the `|| error.code === 'internal'` exemption in `normalizeHandlerError`. Only codes declared on the route pass through; everything else becomes `internal` with an `undeclared_handler_error` cause.
3. Guard cause traversal against cycles and depth: `stampOrigin` here, `flatten` in `error.ts`, `collectCauseMessages` in `disclose.ts`. Reuse the existing `MAX_CAUSE_DEPTH` of 16 for consistency with the client.
4. Move `await request.text()` inside the railway; a rejection becomes `validation_error`.
5. Wrap `resolveDisclosure` so a throwing callback falls back to `public` and the request still completes.
6. Make `jsonResponse` serialization-safe: if `JSON.stringify` throws, fall back to the constant internal response.
7. Handle `PathMatch.invalid_encoding` as `validation_error`; `miss` stays `route_not_found`.
8. Read repeated `k[]` query keys back into arrays, symmetric with slice 02. Single occurrence of `k[]` is still an array.
9. Call `assertHandlersComplete` at construction, and build the route table from the `CompiledContract` rather than recompiling.
10. Update the four owned specs and reverse the `serve.test.ts` expectations that encode the old `internal` passthrough.

Acceptance checks:

- The scout's proof-of-concept is now a regression test: a forged `internal` carrying a connection string returns `{"code":"internal","message":"An unexpected error occurred"}` at default disclosure, with the original visible only at `full`.
- A cyclic cause chain returns a response instead of hanging or overflowing.
- A throwing disclosure callback, a rejecting body stream, and an unserializable success value each produce a valid HTTP response.
- `pnpm exec vitest run src/server src/disclose.test.ts src/error.test.ts && pnpm typecheck`.

## Slice 04: Test infrastructure

Objective: prove the protocol over a real socket, and stop CI from missing regressions it already knows how to catch.

Steps:

1. Add `src/round-trip.test.ts`: a real HTTP server via `toNodeHandler` with `createClient` pointed at it. Cover path values needing encoding, array query params, a domain error, a forged reserved code, disclosure levels, and `unavailable` when the server is down. This is the first test in `src/` that crosses a socket.
2. Move `examples/smoke/protocol/**` into `src/` as ordinary library tests. Rewrite the `@eddy-works/never-rest/contract` import in the fixture to a relative path, and apply `as const satisfies ContractDef` to it so it matches the convention slice 06 is establishing. Confirm `pnpm test` now runs these three test files.
3. Rename the remainder to `examples/conformance/`, update its README to describe one job — checking the example apps still obey the contract — and drop the "read order" framing that presents it as a lesson. Fix the seven READMEs that link `../smoke/README.md`. Ask the lead to rename the `examples:smoke` script to `examples:conformance` in `package.json` and update `ci.yml:73` to match.
4. **Only then** measure coverage and add thresholds to `vitest.config.ts`, set one point below the post-move figure per decision D5. The number will rise on step 2 alone, with no new tests written — do not anchor on the 87.96% / 81.66% baseline.
5. Add `pnpm specs:lint` and coverage to `.github/workflows/ci.yml` — the pre-commit hook already runs specs lint, so CI is strictly weaker than local today.
6. Make `.github/workflows/release.yml` run the full validation block before publishing.
7. Relax the exact-TypeScript-version check in `scripts/typeperf.mjs` to a clear, actionable failure rather than a hard mismatch against 5.9.3 while `package.json` allows `^5.8.3`.

Acceptance checks:

- `pnpm test:coverage` passes with thresholds enabled; the round-trip test fails if slice 01's decode or slice 02's query encoding is reverted.
- The three relocated protocol tests run under `pnpm test` and appear in the coverage report; `pnpm examples:conformance` still passes and no longer contains library tests.
- No repository file still references `examples/smoke` or `examples:smoke`.
- CI config changes are validated by pushing the branch, not by reasoning about YAML.

## Slice 05: Docs and the architectural opinion

Objective: say what the library is before saying what it does.

The framing, to be stated once properly and then referenced: *Never Rest is an opinionated architectural choice — it puts Result-based railway-oriented programming at the API boundary. Whether either side uses railway style internally is up to that team and does not matter to the contract. The assumption is that at least one side wants it; otherwise there is no reason to reach for this.*

Steps:

1. Rewrite the README opening so the opinion leads, before the feature list and the type budget. Fix the stale exports table (missing `compileContract`, `ClientErrorOf`, `ServerErrorOf`, `parseOutput`, `ContractConfigurationError`) and the stale "28 Gherkin scenarios" (it is 38).
2. Add `as const` to the README and `docs/` contract examples, and explain in one sentence why it matters — losing it silently disables the status-map check.
3. Write the 0.4 migration section: input type split, path decoding, query encoding, forged codes now wrapped, `matchPath` return type, and the `as const` requirement.
4. Rewrite the `docs/railway-patterns.md:629` guidance that tells handlers to `mapErr` into `internal`, per decision D7.
5. Document the transport-stability rule for output schemas wherever output validation is described, stop implying arbitrary transforms are safe, and show `checkTransportStability` as the way to prove a schema complies. Add the `./testing` subpath to the README exports table.
6. Refresh `docs/concepts.md` on route-matching order and the trust boundary; extend `docs/comparison.md` with tRPC and Hono RPC rows.
7. Update `specs/README.md` for the two new spec files, and `skills/never-rest/SKILL.md` for the new exports.
8. Merge every slice's changelog bullet into `## [Unreleased]`, written for someone deciding whether to upgrade.

Acceptance checks:

- `pnpm docs:build` passes and no owned doc describes 0.3.0 behaviour that 0.4 changed.
- Every code block in the docs typechecks against the shipped types (spot-check by copying into `.tmp/`).

## Slice 06: Website links and the `as const` sweep

Objective: every published link resolves, and every published contract example demonstrates the correct style.

Steps:

1. Fix the 11 `../examples/*` links in `docs/examples.md`. Either point them at absolute GitHub tree URLs (mirroring the pattern already working at line 38) or teach `website/lib/doc-link.tsx` to rewrite `../examples/` into the repository URL. Prefer the `doc-link.tsx` rule so the markdown keeps working on GitHub too.
2. Verify by building and checking the emitted HTML, then re-check the live URLs after deployment.
3. Update the website home page tagline to match the new framing.
4. Add `as const` to the eight example contract sites listed in the ownership table.

Acceptance checks:

- `pnpm docs:build`, then grep the built HTML for `href="../examples` — zero matches.
- `pnpm examples:typecheck` and `pnpm examples:smoke` pass with `as const` applied.
- Post-merge, every example link on the deployed site returns 200.

## Simplicity gate

- [x] Every owned path appears in exactly one slice; `src/contract/index.ts`, `docs/examples.md`, `CHANGELOG.md`, and `src/server/router.ts` were each collision points and now have a single owner.
- [x] Every consumed interface is exposed by an earlier slice: `ClientInputOf` / `HandlerInputOf` / `PathMatch` / `assertHandlersComplete` all come from 01, which has no dependencies.
- [x] New files justified. `src/round-trip.test.ts`: no existing test crosses a socket, so path encoding and query serialization are provable only in-process today. Two new spec files: the existing five map title-for-title to specific behaviours and cannot absorb compilation or wire-serialization scenarios without breaking that map. `src/testing/`: a test-only helper on the main export would put a development utility in every consumer's runtime surface, and the existing subpaths (`contract`, `server`, `client`, `node`) are all production-facing. Beyond that, no new runtime module — every protocol fix extends an existing one.
- [x] Interaction patterns replaced only with a stated user problem: the `matchPath` signature changes because a silent raw fallback keeps the bug; `buildRequest` returns a `Result` because throwing out of a library that promises not to throw is the defect.
- [x] No system-building without consumers: `assertHandlersComplete` is called by `serve`; the compiled representation is consumed by both `serve` and `createClient`; the input type split is consumed by client, handler, and docs.
- [x] Root-cause evidence for every bug, reproduced against 0.3.0 and recorded case-by-case in the appendix. Nothing here patches a symptom.
- [x] `defineContract()`, route-overlap detection, runtime transform-stability checking, and Phase 2 input separation are explicitly rejected for this release.

## Riskiest slice

**Slice 03.** It removes a passthrough that published documentation actively encourages (D7), changes the wire meaning of repeated query keys in lockstep with slice 02, and owns the integration choke point. Its fail-safe must not swallow genuine bugs into an opaque 500 during development — the constant-body response should still be reachable in tests at `full` disclosure. Land slice 01 first; do not start 02 and 03 until its types exist.

## Appendix: regression cases to promote into tests

Every row below was observed running against `main` at 0.3.0. The scouts' scratch repros live under `.tmp/scout-a/` and `.tmp/scout-b/`, which is **gitignored** — so the cases are recorded here instead, because a fresh clone will not have them. Each owning slice turns its rows into real tests; rows marked *already correct* are non-regression tests that must keep passing.

**Slice 01 — contract foundation**

| Case | Observed on 0.3.0 | Required |
| --- | --- | --- |
| `matchPath` on `/echo/hello%20world` | param is `hello%20world` | `hello world` |
| `matchPath` on `/echo/a%2Fb` | `a%2Fb` | `a/b` |
| `matchPath` on `/echo/caf%C3%A9` | `caf%C3%A9` | `café` |
| `matchPath` on a literal `%2F` value (`%252F`) | `%252F` | `%2F` |
| `matchPath` on `/echo/%zz` | `URIError` from `decodeURIComponent` | `{ kind: 'invalid_encoding', param }`, no throw |
| `GET /users/:id` and `GET /users/:userId` in one contract | compiles | `ContractConfigurationError` naming both operations |
| `GET /users` and `GET /users/` | compiles | `ContractConfigurationError` |
| `/a/:id/b/:id` | compiles; second capture wins (`{ id: '2' }`) | `ContractConfigurationError` |
| Handler map missing a key, or a non-function value via `as any` | construction passes; request 500s | throws at construction |
| `ClientInputOf` / `HandlerInputOf` for `z.string().transform(Number)` | n/a | `{ limit: string }` and `{ limit: number }` |
| `checkTransportStability` on ISO-string→`Date` | n/a | Ok |
| `checkTransportStability` on `z.number().transform(String)` | n/a | Err |

**Slice 02 — client wire fidelity**

| Case | Observed on 0.3.0 | Required |
| --- | --- | --- |
| `parseInput({ limit: 42 })` where input is `z.string().transform(Number)` | Err "expected string, received number" | client accepts `'42'`; handler receives `42` |
| GET route with `z.number().default(10)`, field omitted | client applies default, sends `"10"`, server rejects | server applies the default; request omits the key |
| GET with `tags: ['a','b']` | key absent from query | `?tags[]=a&tags[]=b` |
| GET with a single-element array | key absent | `?tags[]=a`, read back as an array |
| GET with a nested object, `bigint`, or nested array | silently dropped | `validation_error` before fetch |
| GET with a `Date` | dropped | ISO 8601 scalar |
| GET with `null` / `undefined` | omitted | omitted (*already correct*) |
| GET with `NaN` / `Infinity` | schema rejects | schema rejects (*already correct*) |
| Path param missing, `undefined`, or `null` | URL keeps a literal `:id` | `validation_error` before fetch |
| Path param `''` | URL becomes `/users/` | `validation_error` before fetch |
| Sync-throwing `headers()` callback | throw escapes the call | `Err` |
| Header callback returning a rejected promise | `unavailable` (*already correct*) | unchanged |
| POST body with a circular reference | `JSON.stringify` throw escapes | `Err` |
| POST with a header value containing a newline | `new Headers()` throw escapes | `Err` |
| GET with the same bad header value | `unavailable` — GET never builds `Headers` | `Err`, consistently with POST |
| POST with a `bigint` that passes validation | throw escapes | `Err` |
| Unknown remote error code | remote message copied into the outer `internal` | constant message; remote preserved as `cause` |
| `compilePath` calls per request | 1 per `buildRequest` | 0 — uses the precompiled path |

**Slice 03 — server**

| Case | Observed on 0.3.0 | Required |
| --- | --- | --- |
| Handler returns forged `err(railError('internal', 'postgres://admin:secret@db.internal'))` via `as any`, disclosure omitted | body is `{"code":"internal","message":"postgres://admin:secret@db.internal"}` | generic message; original only at `full` |
| Handler returns forged `validation_error` or `route_not_found` | wrapped to generic `internal` (*already correct*) | unchanged |
| Handler throws | `{"code":"internal","message":"An unexpected error occurred"}` (*already correct*) | unchanged |
| `request.text()` rejects | rejection escapes | `validation_error` |
| Disclosure callback throws | throw escapes | falls back to `public`, request completes |
| Success value that cannot be serialized | `JSON.stringify` throw escapes | constant-body internal response |
| Cyclic `cause` chain | stack overflow in `stampOrigin` | bounded; a response is returned |
| Undecodable path capture | reaches the handler encoded | `validation_error` |
| Repeated `k[]` query keys | last value wins as a scalar | array, symmetric with slice 02 |

**Slice 05 — docs**

| Case | Observed on 0.3.0 | Required |
| --- | --- | --- |
| README quickstart contract with a status map missing `not_found` | compiles, because `errors` widened to `string` | fails to compile with `as const satisfies` |

## Suggested `eng-team-implement` handoff

```text
Implement plans/20260812-protocol-cannot-lie-0.4.md
Use 6 slices per the coordination brief. 01 and 06 start immediately; 02 and 03 after 01; 04 and 05 after 02+03.
Slice 06 additionally waits for the in-flight examples work (plans/20260812-examples-protocol-teaching.md) to merge.
Strict file ownership. Do not edit package.json, perf/**, src/respond.ts, src/status.ts, or src/index.ts.
D1 is resolved (document the transport-stability rule and ship the test helper). Resolve D2-D7 with the human before slices 02, 03 and 05 depend on them.
Do not implement Phase 2 params/query/body, defineContract(), or route-overlap detection.
Gate each slice with its acceptance checks; run the full Validation block before merge.
```
