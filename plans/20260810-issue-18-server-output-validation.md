# Plan: Issue #18 — Opt-in server output validation

Mission: Let `serve()` validate successful handler values against each route's output schema before serialising, as a pure gate that never rewrites a passing response.

Definition of done:

- `ServeOptions` accepts `validateOutput?: boolean`; only `true` enables validation.
- With validation enabled and passing, the response body is byte-identical to the current behaviour.
- With validation enabled and failing, the response is the route's declared `internal` 500 and the invalid body is never serialised.
- The failure error carries no schema field paths at its top level, so graded disclosure can redact them.
- With validation absent or `false`, no schema work runs and behaviour is unchanged.
- Gherkin scenarios exist and tests cite their titles one-to-one.

Validation: `pnpm exec vitest run src/server/serve.test.ts && pnpm specs:extract && pnpm typecheck && pnpm lint && pnpm perf:check && pnpm build`

Size budget: 4 existing files edited, 1 new spec file, roughly 60–95 added lines; exceeding this triggers re-scoping. One implementation slice is sufficient; an 8-agent team would be oversized.

## Changes from proposal

| Proposal says | Plan says | Rationale |
| --- | --- | --- |
| Add opt-in `validateOutput: true` to `ServeOptions`; default off. | Add `readonly validateOutput?: boolean`; only `true` enables validation. | Additive and patch-compatible. |
| Run `route.output` validation before serialising. | Validate only successful handler results, and serialise the handler's own value rather than the schema's return value. | Zod object schemas strip unknown keys, so serialising the schema result would silently drop fields from responses when the flag is switched on. Validation stays a safety gate, not a response rewriter. |
| — | Failures become `internal` with detail nested under `cause`. | Output mismatch is a server defect, not caller input failure, and nesting detail lets `disclose` strip it for untrusted callers. |

## Reuse

| Capability | Existing artifact | Verdict | Why |
| --- | --- | --- | --- |
| Public server configuration | `src/server/serve.ts` — `ServeOptions` | extend | This is the established server options seam, already shaped for optional flags. |
| Standard Schema invocation | `src/contract/parse.ts` — `validateInput` | reuse pattern | It already covers sync results, promise results, thrown validators, issues, and a missing `value`. Copy that control flow, not its `validation_error` mapping. |
| Failure error shape | `src/server/serve.ts` — `internalFromThrown` | reuse pattern | It puts a generic message at the top level and detail under `cause`, which `disclose` drops for `internal` and `public` callers. Do **not** copy `src/client/response.ts` — its `validateValue` flattens issue paths into the message, and `disclose` passes messages through verbatim at every level, so that shape leaks schema field names to public callers. |
| Error response and disclosure | `src/server/serve.ts` — `respondWithError` | reuse | It preserves origin stamping, declared-status handling, and graded disclosure. |
| Declared failure status | `src/server/serve.ts` — `declaredStatusesForRoute` | reuse | `internal` is already declared for every route, so no status-map or declaration change is needed. |
| Server behaviour tests | `src/server/serve.test.ts` | extend | `createHandler` and `call` fixtures already exercise `serve()` and response bodies. |
| Behaviour specification | `specs/` + `specs/README.md` | extend, plus one new file | `specs/README.md` makes specs the source of truth and requires tests to cite scenario titles one-to-one. Output validation is its own capability, so it warrants a sibling file rather than being wedged into `status-mapping.md` or `graded-disclosure.md`, whose capability rows are already scoped to other seams. |
| Public API documentation | `docs/api.md` — `ServeOptions` and `serve` behaviour | extend | This is the canonical server reference. |
| Release notes | `CHANGELOG.md` — `## [Unreleased]` | extend | `AGENTS.md` requires an entry for any consumer-visible change; this adds a public option. |

## What stays the same

- Input parsing and its `validation_error` behaviour.
- Handler error handling, exception conversion, origin stamping, disclosure, and status mapping.
- Passing response bodies, whether the flag is on or off.
- Successful output remains unvalidated when the option is absent or `false`.
- Client-side response validation.
- No contract export, status-map entry, dependency, or generated `dist` file changes.

## Decisions

Both resolved; none left open.

- **Serialise the handler value, not the schema value.** Enabling the flag must not change a passing response. Callers who want schema coercion can apply it inside the handler.
- **Failures are `internal`, with detail under `cause`.** Output mismatch is a server defect, and the nested shape is the only one the existing disclosure levels can redact.

## Coordination brief

| Slice | Objective | Owns (exclusive) | Must not touch | Interfaces exposed | Interfaces consumed | After |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Add, specify, test, and document opt-in output validation | `src/server/serve.ts`, `src/server/serve.test.ts`, `specs/server-output-validation.md`, `specs/README.md`, `docs/api.md`, `CHANGELOG.md` | Client and contract modules; status map; `package.json`; lock files | `ServeOptions.validateOutput?: boolean` | `route.output['~standard'].validate`, `respondWithError`, `internalFromThrown`, existing `internal` status | - |

Contested files:

- `docs/api.md` is also edited by the issue #17 plan, in the `ClientOptions` section around L454–462. This plan only touches `ServeOptions` (L397–405) and the `serve` behaviour notes below it, so whichever plan lands second rebases without a semantic conflict.
- `CHANGELOG.md` is also edited by the issue #17 plan. Both append a bullet under `## [Unreleased]` → `### Added`, so the conflict is textual and trivial.

## Slice 01: Validate successful server output

Objective: Gate successful handler values against the route's output schema at the server boundary, without altering passing responses or existing error behaviour.

Owned paths: `src/server/serve.ts`, `src/server/serve.test.ts`, `specs/server-output-validation.md`, `specs/README.md`, `docs/api.md`, `CHANGELOG.md`

Steps:

1. Add `readonly validateOutput?: boolean` to `ServeOptions`.
2. Add a server-private validation helper that mirrors the control flow of `validateInput` in `src/contract/parse.ts`: call `schema['~standard'].validate`, await a promise outcome, and treat issues, a missing `value`, and a thrown validator as failure.
3. Map every failure to `internal` using the shape `internalFromThrown` already establishes — a generic top-level message with the specifics (including any issue paths) nested under `cause`. Never place schema field paths in the top-level message; `disclose` passes messages through unchanged at `internal` and `public`.
4. After `invokeHandler`, leave `Err` results untouched. When the result is `Ok` and `options.validateOutput === true`, run the helper against `handlerResult.value`.
5. On failure, route the error through `respondWithError` so origin stamping, declared statuses, and disclosure all apply. Do not construct ad-hoc JSON.
6. On success, pass the original `handlerResult` to `respond`. Discard the schema's returned value — it is only a pass/fail signal here.
7. Write `specs/server-output-validation.md` following the convention in `specs/README.md`: frontmatter (`title`, `domain: server`, `status: draft`), a job-story callout, overview prose, and one fenced `gherkin` block per scenario with exactly one `When`. Cover: validation disabled leaves the body untouched; enabled and conforming returns 200; enabled and non-conforming returns the declared `internal` 500; and a public-disclosure failure exposes no schema field paths.
8. Add the corresponding rows to the two tables in `specs/README.md` (the `Files` capability table and the test-mapping table pointing at `src/server/serve.test.ts`).
9. Add tests in `src/server/serve.test.ts` named after those scenario titles, reusing `createHandler` and `call`. Include one case where the schema would strip or coerce a passing value, asserting the response body still matches the handler's exact return. To assert that disabled validation does no schema work, wrap the fixture schema's `~standard.validate` in a spy and assert it is not called.
10. Update `docs/api.md`: add the field to the `ServeOptions` block, and add a behaviour note covering default-off, success-only, gate-not-rewrite semantics, and the `internal` failure mapping with detail under `cause`.
11. Add an `Added` entry under `## [Unreleased]` in `CHANGELOG.md`, referencing issue #18 and stating plainly that validation gates the response rather than rewriting it, since readers migrating from ts-rest's `responseValidation` will assume otherwise.

Acceptance checks:

- The focused server test passes, and every spec scenario title has exactly one matching test.
- Typecheck, lint, type-performance gate, and build pass.
- For a passing handler, the response body is identical with the flag on and off.
- An invalid output never serialises as 2xx when validation is enabled.
- Under `public` disclosure, a validation failure body contains no schema field paths.
- No schema validation runs when the option is absent or `false`.
- `CHANGELOG.md` has an `## [Unreleased]` entry.

## Follow-ups (outside this slice)

- Version bump and tag: releases publish only when a pushed `v*` tag matches `package.json`, and this slice deliberately does not touch `package.json`.
- Reply on [issue #18](https://github.com/project-eddy/never-rest/issues/18) once released, noting the gate-not-rewrite semantics, which differ from ts-rest's `responseValidation`.
