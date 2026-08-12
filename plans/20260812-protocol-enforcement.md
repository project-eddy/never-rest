# Plan: Protocol enforcement (0.3.0)

Mission: Make Never Rest enforce an authoritative protocol at construction time and at every HTTP boundary—honest failure types, always-on parsed output serialization, fail-closed disclosure and undeclared failures—without Phase 2 input-source separation.

Definition of done:

- Generated client returns `ClientErrorOf` (domain + `validation_error` + `internal` + `unavailable`); no cast hides built-ins.
- Handlers stay `ErrorOf`-only; undeclared runtime handler codes and throws become `internal` with nested cause; public disclosure hides that cause.
- Successful handler values always pass through the output schema; the **parsed** value is serialized (stripping/transforms apply on the wire).
- `serve()` resolves omitted disclosure to `public`; host miss uses `route_not_found` (not domain `not_found`).
- `compileContract` + runtime status-map checks fail closed at construction; reserved codes cannot be domain codes; client error envelopes are structurally validated and depth-bounded.
- Specs, docs, examples, changelog, and CI gates (`lint`/`typecheck`/`test`/`perf:check`/`build`/`docs:build`/`examples:*`/publint/attw) pass. Phase 2 (`params`/`query`/`body`) is **out of scope**.

Validation:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm perf:check && pnpm build \
  && pnpm docs:build && pnpm examples:smoke && pnpm examples:typecheck \
  && pnpm exec publint && pnpm exec attw --pack --profile esm-only
```

Size budget: ~18–22 files touched (3 new: `src/contract/compile.ts`, `src/server/types.ts`, plus tests); roughly +500/−150 lines. Exceeding ~25 files or inventing escape hatches triggers re-scoping. **4 slices are enough; an 8-agent team would be oversized.**

## Changes from proposal

| Proposal says | Plan says | Rationale |
| --- | --- | --- |
| Milestones 1–5 including Phase 2 input sources in the same programme | Implement workstreams A–F (milestones 1–4) only; Phase 2 is a separate plan/PR | Proposal itself says do not combine Phase 2 unless earlier work stays easy to review. |
| `resolveDisclosure` → `public`; low-level helpers can stay explicit | Change **only** `serve()`'s `resolveDisclosure` default to `public`; leave `respond()` defaulting to `full` | Matches the brief's "HTTP edge" rule; `respond` remains the explicit low-level helper. |
| `compileContract` as shared normalized representation both sides operate from | Add `compileContract` for construction-time validation; keep `compileRoutes` for path matching; both called from `serve`/`createClient` | Router already owns path compile/match; overbuilding a compiler framework is an explicit non-goal. |
| Reverse opt-in gate-not-rewrite output validation | Explicitly reverse `plans/20260810-issue-18-server-output-validation.md` / issue #18: remove `validateOutput`, always parse, serialize schema output | Current product law is the opposite; this is intentional 0.x breaking correction. |
| Suggested delivery as five sequential milestones | Four file-exclusive slices with `after` edges mirroring milestones 1→2/3→4 docs | Parallel agents need exclusive paths; milestone order is expressed as `after`, not five overlapping owners of `serve.ts`. |
| Version target `0.3.0` | Document as the intended release; do **not** bump `package.json` in implementation slices (release workflow owns tag/version) | Matches existing plan convention and AGENTS.md release steps. |

## Reuse

| Capability | Existing artifact | Verdict | Why |
| --- | --- | --- | --- |
| Domain error alias | `src/contract/types.ts` → `ErrorOf` | extend | Keep as handler/domain surface; add `ServerErrorOf` / `ClientErrorOf` beside it. |
| Client mapped type | `src/client/types.ts` → `Client` | extend | One-level mapped type; swap error arm only. |
| Remove unsafe cast | `src/client/create.ts` `callRoute` L62 | extend | Runtime already returns wider failures via `mapResponse`. |
| Shared schema parse | `src/contract/parse.ts` private `validateInput` | extend | Export `parseSchema` returning parsed value; dedupe `serve.ts` / client `validateValue`. |
| Output → `internal` | `serve.ts` `validateOutput` / `internalFromOutputValidation` | extend | Flip to always-on + return parsed value; map failure under `cause`. |
| Undeclared handler code | `status.ts` `toDeclaredResponse` (status only) | build new `normalizeHandlerError` | Today undeclared codes keep body code and only degrade HTTP status (`serve.test.ts` expects wire `conflict`). |
| Status map types | `src/status.ts` `StatusMap` | extend via `src/server/types.ts` | Derive `ServeStatusMap<TContract>`; add host `route_not_found`. |
| Path compile | `src/contract/path.ts` `compilePath`; `router.ts` `compileRoutes` | reuse + extend | Call from `compileContract`; do not replace router. |
| Runtime status assert | `declaredStatusesForRoute` assumes keys | build new `assertStatusMap` | No construction-time completeness check today. |
| Disclosure resolver | `serve.ts` `resolveDisclosure` | extend | Change `?? 'public'` only at serve edge. |
| Envelope parse | `response.ts` `isRailError` | extend → `parseRailErrorEnvelope` | Shape guard only; add field/depth validation. |
| Unknown remote code | `response.ts` `mapDeclaredError` | extend → `mapProtocolError` | Already maps non-declared to `internal`; keep semantics, tighten typing. |
| Type tests | `*.test-d.ts` + `Expect<>` | reuse | Extend client + contract/handler proofs. |
| Specs ↔ tests | `specs/README.md` title-for-title | reuse | Rewrite scenarios that encode inverted policy. |

## What stays the same

- Handler type remains route-declared domain errors only (`ErrorOf` / `RailError<TRoute['errors'][number]>`).
- Input contract shape (`input` schema + method-based query/body merge); Phase 2 deferred.
- `disclose` levels and redaction rules (`full` / `internal` / `public`).
- `respond()` as low-level helper with explicit disclosure (default `full` unchanged).
- `compileRoutes` / `matchRoute` matching semantics (declaration order, `:param` segments).
- Client already validates 2xx bodies through the output schema and returns parsed success values.
- No OpenAPI, middleware system, multipart, streaming, framework adapters, or `onInternalError` hook.
- No `unsafeSkipOutputValidation` escape hatch in this release.
- `package.json` version stays `0.2.0` until the release cut.

## Decisions for humans

- **`respond()` keeps default `full`.** Resolved: yes — only `serve()` defaults omitted disclosure to `public`.
- **Server status maps drop `unavailable`.** Resolved: yes — client synthesizes `unavailable`; do not put it on `ServeStatusMap`.
- **Release tagging.** Resolved: yes — implementation lands under Unreleased; humans cut `0.3.0` / `v0.3.0` separately (do not bump `package.json` version).
- **External consumers (e.g. Ombo ADR citing `validateOutput`).** Out of repo; call out in migration notes only.

## Coordination brief

| Slice | Objective | Owns (exclusive) | Must not touch | Interfaces exposed | Interfaces consumed | After |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Contract types, shared parse, compileContract | `src/contract/types.ts`, `src/contract/types.test-d.ts`, `src/contract/parse.ts`, `src/contract/parse.test.ts`, `src/contract/compile.ts` (new), `src/contract/compile.test.ts` (new), `src/contract/index.ts` | client/, server/, docs/, examples/, CHANGELOG | `ServerErrorOf`, `ClientErrorOf`, `ServerSystemErrorCode`, `ClientSystemErrorCode`, `parseSchema`, `parseOutput`, `compileContract`, `CompiledContract`, `ContractConfigurationError`, `RESERVED_ERROR_CODES` (internal) | `ErrorOf`, `compilePath`, `railError`, Standard Schema | - |
| 02 | Honest client types + bounded envelope | `src/client/types.ts`, `src/client/types.test-d.ts`, `src/client/create.ts`, `src/client/create.test.ts`, `src/client/response.ts`, `src/client/index.ts`, `specs/client-results.spec.md` | contract/ (except imports), server/, docs/, examples/, CHANGELOG | `Client<T>` with `ClientErrorOf`; `parseRailErrorEnvelope`; `mapProtocolError` (module-private OK) | `ClientErrorOf`, `ServerErrorOf`, `compileContract`, `parseInput` | 01 |
| 03 | Server egress, status map, disclosure, normalize | `src/server/types.ts` (new), `src/server/serve.ts`, `src/server/serve.test.ts`, `src/server/index.ts`, `specs/server-output-validation.spec.md`, `specs/status-mapping.spec.md`, `specs/graded-disclosure.spec.md` (serve-default scenarios only) | contract/ sources, client/, docs/, examples/, CHANGELOG, `src/respond.ts` | `ServeStatusCode`, `ServeStatusMap`, `ServeOptions<TContract>`, always-on parse path, `route_not_found`, `normalizeHandlerError` (private) | `compileContract`, `parseInput`, `parseOutput`, `assertStatusMap` (local or from compile), `disclose`/`respond` | 01 |
| 04 | Docs, examples, specs index, changelog | `CHANGELOG.md`, `README.md`, `docs/api.md`, `docs/concepts.md`, `docs/migrating.md`, `docs/examples.md`, `specs/README.md`, `skills/never-rest/SKILL.md`, `examples/packages/shared-contract/src/contract.ts`, `examples/hono/src/handler.ts`, `examples/express/src/handler.ts`, `examples/sveltekit/src/hooks.server.ts`, `examples/next-app-router/app/api/[...path]/route.ts`, `examples/cloudflare-workers/src/index.ts`, `examples/gateway/src/run.ts`, `examples/validators/src/statuses.ts`, `examples/validators/src/run.ts`, `examples/smoke/**` (if status/assert touch) | `src/**` implementation | Migration notes + public docs matching new invariant | Public types from 01–03 | 02, 03 |

Contested files and their single owner:

- `src/contract/types.ts` / `parse.ts` / `index.ts` → slice 01
- `src/client/create.ts` / `response.ts` / `types.ts` → slice 02
- `src/server/serve.ts` / `serve.test.ts` / server specs → slice 03
- `CHANGELOG.md`, `docs/api.md`, `specs/README.md`, all examples → slice 04
- `src/respond.ts` → **lead reserved (no edit)** unless humans decide default must change
- `package.json` / lockfiles / `perf/baseline.json` → **lead reserved**; slices request in their report if slope fails
- `src/server/router.ts` → **untouched** (slice 01 calls `compilePath`; slice 03 keeps using `compileRoutes`)

## Slice 01: Contract foundation

Objective: Add honest error-layer aliases, shared schema parsing that returns parsed output, and construction-time `compileContract`.

Owned paths: listed in coordination brief.

Steps:

1. Extend `src/contract/types.ts` with `ServerSystemErrorCode`, `ClientSystemErrorCode`, `ServerErrorOf`, `ClientErrorOf` exactly as the brief; keep `ErrorOf` as domain-only.
2. Add type tests proving: domain codes ∈ `ClientErrorOf`; `validation_error` / `internal` / `unavailable` ∈ `ClientErrorOf`; undeclared domain code ∉; handler/`ErrorOf` does **not** intentionally accept `internal` or `validation_error`.
3. Refactor `parse.ts`: extract `parseSchema` → `ResultAsync<Output, SchemaFailure>`; implement `parseInput` (→ `validation_error`) and `parseOutput` (→ `internal` with `output_validation_failed` cause) on top. Preserve issue mapping; do not leak paths at top-level public messages.
4. Add `src/contract/compile.ts`: `ContractConfigurationError`, `RESERVED_ERROR_CODES` (`validation_error`, `internal`, `unavailable`, `route_not_found`), duplicate `method+path`, `compilePath` per route, duplicate codes within a route, reserved codes as domain codes. Return `{ contract, domainErrorCodes, … }` — no ambiguous-route analysis.
5. Export new symbols from `src/contract/index.ts`.
6. Tests: compile failures (dup route, reserved code, dup code); parseOutput success returns transformed value; parseOutput failure → `internal`.

Acceptance checks:

- `pnpm exec vitest run src/contract` and contract `.test-d.ts` via typecheck pass.
- No client/server files modified.
- Reserved-code and duplicate-route throws are clear construction errors.

## Slice 02: Client protocol honesty

Objective: Type and parse the full client failure space; validate error envelopes; construct via `compileContract`.

Owned paths: listed in coordination brief.

Steps:

1. Change `Client` to `ResultAsync<OutputOf, ClientErrorOf>`.
2. Retype `callRoute` to `ClientErrorOf`; **delete** the final `as ResultAsync<…, ErrorOf<…>>` cast. Fix intermediate signatures if Neverthrow needs help—never restore the cast.
3. Call `compileContract(contract)` once in `createClient` before building methods.
4. Replace `isRailError` with bounded `parseRailErrorEnvelope` (depth ≤ 16; validate `issues`/`origin`/`nextStep`/`retryable`/`cause`; malformed → treat as non-envelope).
5. Map protocol errors via `mapProtocolError`: declared domain → keep; `validation_error`/`internal` → keep; unknown code → `internal` with remote as cause.
6. Fix `create.test.ts` landmine: route that lists `validation_error` as a domain code must stop doing so (reserved); add cases for malformed envelope, deep cause, unknown code → `internal`.
7. Rewrite/extend `specs/client-results.spec.md` scenarios to match; keep title↔test mapping.

Acceptance checks:

- Client type tests match the brief's `Expect`/`ExpectNot` matrix.
- Runtime tests cover validation_error, unavailable, internal, declared domain, unknown code, malformed envelope, deep cause.
- `pnpm typecheck && pnpm exec vitest run src/client && pnpm perf:check` — if slope rises, simplify aliases before asking lead to touch baseline.

## Slice 03: Server protocol enforcement

Objective: Always-on parsed output, undeclared-handler normalization, derived status map, `route_not_found`, public disclosure default, construction-time status validation.

Owned paths: listed in coordination brief.

Steps:

1. Add `src/server/types.ts` with `ContractDomainErrorCode`, `ServerHostErrorCode` (`validation_error` | `internal` | `route_not_found`), `ServeStatusCode`, `ServeStatusMap`.
2. Change `ServeOptions` to `ServeOptions<TContract extends ContractDef>` with `statuses: ServeStatusMap<TContract>`; **remove** `validateOutput`.
3. At `serve()` construction: `compileContract(contract)`; `assertStatusMap` over domain codes ∪ host codes (integer 400–599); then `compileRoutes` as today.
4. Unmatched method/path → `railError('route_not_found', …)` at `statuses.route_not_found` (never domain `not_found`).
5. After handler Err: `normalizeHandlerError` (declared → pass through; else `internal` + `undeclared_handler_error` cause chain); stamp origin after normalization.
6. After handler Ok: `parseOutput`; on Err → `respondWithError`; on Ok → serialize **`outputResult.value` only**.
7. `resolveDisclosure`: `disclosure ?? 'public'` (functions unchanged). Do not edit `respond.ts`.
8. Delete private duplicate Standard Schema helpers in `serve.ts` that `parseOutput` replaces.
9. Rewrite `specs/server-output-validation.spec.md` for always-on + wire-serializer semantics (include stripping schema critical case). Update status-mapping / graded-disclosure specs for `route_not_found` and omitted→public.
10. Update `serve.test.ts`: reverse expectations that encode gate-not-rewrite, opt-in off, wire `conflict` for undeclared, `not_found` for miss, omitted disclosure = full.

Acceptance checks:

- Critical stripping test: handler returns extra fields → JSON equals schema output only.
- Undeclared handler code → body `internal`; public disclosure hides cause; full disclosure preserves it; omitted disclosure ≡ public.
- Missing/invalid status or reserved domain code throws at construction.
- Type test (in slice 01 or a small `src/server/types.test-d.ts` owned here if needed): missing status key fails compilation.
- `pnpm exec vitest run src/server && pnpm typecheck && pnpm perf:check`.

## Slice 04: Docs, examples, changelog

Objective: Make public surface and examples match the new invariant; satisfy changelog CI gate.

Owned paths: listed in coordination brief.

Steps:

1. `CHANGELOG.md` under `## [Unreleased]`: `Changed`/`Removed`/`Fixed` bullets for honest client errors, always-on output serialization, disclosure default, `route_not_found`, removed `validateOutput`, construction-time checks—written for upgraders.
2. Update `docs/api.md`, `concepts.md`, `migrating.md` (breaking notes from #18 / 0.2.0), `examples.md`, `README.md`, skill index as needed.
3. Examples: add `route_not_found` status; remove `validateOutput`; drop `unavailable` from **server** status maps; ensure smoke/typecheck still pass.
4. `specs/README.md` capability ↔ file table rows for rewritten specs.

Acceptance checks:

- `pnpm docs:build && pnpm examples:smoke && pnpm examples:typecheck`
- Changelog has Unreleased consumer-facing entries; no stale “opt-in validateOutput / gate-not-rewrite” claims in owned docs.

## Simplicity gate (pre-delivery checklist)

- [x] Every owned path appears in exactly one slice.
- [x] Consumed interfaces are exposed by an earlier/`after`-satisfied slice.
- [x] New files justified: `compile.ts` (no existing construction validator), `server/types.ts` (status derivation), compile tests — alternatives (`inline in serve`, overload `StatusMap` in root) couple client and server or weaken types.
- [x] Interaction-pattern replacements stated with user problem: gate-not-rewrite left undeclared fields on the wire; fail-open disclosure leaked causes; host/`not_found` conflation.
- [x] No system-building without consumers: `compileContract` consumed by `serve` + `createClient`; `parseOutput` by `serve`; aliases by client + docs.
- [x] Bug work has root-cause evidence from scouts (cast at `create.ts` L62; serialize path at `serve.ts` L294–316; `respond`/`resolveDisclosure` defaults; `toDeclaredResponse` keeps undeclared body codes).
- Phase 2 and `onInternalError` / unsafe bypass explicitly rejected for this plan.

## Riskiest slice

**Slice 03 (`serve.ts`)** — reverses live #18 semantics, renames host miss code, changes disclosure default, and owns the integration choke point. Land 01 first; keep 02 parallel only after 01 types exist.

## Suggested `eng-team-implement` handoff

```text
Implement plans/20260812-protocol-enforcement.md
Use 4 slices per coordination brief (not 8).
Strict file ownership; slices 02 and 03 after 01; slice 04 after 02+03.
Do not implement Phase 2 params/query/body.
Do not edit src/respond.ts or package.json version unless the plan's human decisions say otherwise.
Gate each slice with its acceptance checks; full Validation block before merge.
```
