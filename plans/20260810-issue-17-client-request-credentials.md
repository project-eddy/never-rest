# Plan: Issue #17 — Client request credentials

Mission: Let callers configure Fetch API credentials directly through `ClientOptions`, so cookie-authenticated apps need no wrapped `fetch`.

Definition of done:

- `ClientOptions` accepts `credentials?: RequestCredentials`.
- Every generated request forwards the configured value, on both query methods and body methods.
- Omitting the option leaves the underlying fetch implementation's own default in force.
- Runtime tests and the API reference cover the option.

Validation: `pnpm exec vitest run src/client/create.test.ts && pnpm typecheck && pnpm lint && pnpm build`

Size budget: 6 library/docs files plus the gateway example (`examples/gateway/src/run.ts`, `examples/gateway/README.md`), roughly 15–35 added lines and no new files; exceeding this triggers re-scoping. One implementation slice is sufficient; an 8-agent team would be oversized.

## Changes from proposal

| Proposal says | Plan says | Rationale |
| --- | --- | --- |
| Add `credentials?: RequestCredentials` to `ClientOptions`. | Add the option unchanged. | It mirrors the web-standard `RequestInit` field and is purely additive. |
| Default to `'same-origin'`. | Inject nothing when the option is omitted. | Browser `fetch` already defaults to `same-origin`, and staying silent also preserves the semantics of caller-supplied `fetch` implementations and non-browser runtimes, where an injected default would be a behaviour change. |

## Reuse

| Capability | Existing artifact | Verdict | Why |
| --- | --- | --- | --- |
| Public client configuration | `src/client/types.ts` — `ClientOptions` | extend | This is the existing public options seam. |
| Construct fetch options | `src/client/request.ts` — `buildRequest` | extend | It already owns the `RequestInit`. It is internal — `src/client/index.ts` exports only `createClient`, `Client`, and `ClientOptions` — so extending its signature has no public API impact and needs no options-object refactor. |
| Pass client options into requests | `src/client/create.ts` — `callRoute` | extend | It is the sole bridge from `ClientOptions` to `buildRequest`. |
| Verify outgoing fetch options | `src/client/create.test.ts` — fetch stubs | extend | Existing assertions already inspect the `RequestInit` passed to the stub. |
| Public API documentation | `docs/api.md` — `ClientOptions` | extend | This is the canonical options reference. |
| Release notes | `CHANGELOG.md` — `## [Unreleased]` | extend | `AGENTS.md` requires an entry for any consumer-visible change; this adds a public option. |
| Behaviour specification | `specs/client-results.md` | no change | That spec's capability is response-to-`Result` mapping, not request construction, and this change adds no new outcome to map. Recorded as a decision rather than an omission. |

## What stays the same

- `fetch` selection, header resolution, input validation, URL construction, request bodies, and response mapping.
- Existing wrapped or custom `fetch` functions keep working; this option is an alternative, not a replacement.
- No credential mode is inferred or forced.
- No dependencies, exports, generated `dist` files, or performance fixtures change. The gateway example is updated only to demonstrate `credentials: 'include'` on `createClient`.

## Decisions

Both resolved; none left open.

- **Omission injects nothing**, rather than an explicit `'same-origin'`, so custom `fetch` implementations keep their own defaults.
- **No new spec scenario**, because request construction sits outside the capability `specs/client-results.md` covers.

## Coordination brief

| Slice | Objective | Owns (exclusive) | Must not touch | Interfaces exposed | Interfaces consumed | After |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Add and verify credentials pass-through | `src/client/types.ts`, `src/client/request.ts`, `src/client/create.ts`, `src/client/create.test.ts`, `docs/api.md`, `CHANGELOG.md`, `examples/gateway/src/run.ts`, `examples/gateway/README.md` | Server and contract modules; `package.json`; lock files | `ClientOptions.credentials?: RequestCredentials`; internal `buildRequest(route, baseUrl, input, headers, credentials?)` | Existing `ClientOptions`, `RequestInit`, `callRoute` flow | - |

Contested files:

- `docs/api.md` is also edited by the issue #18 plan, in the `ServeOptions` section around L397–405. This plan only touches `ClientOptions` (L454–462) and the `createClient` notes below it, so whichever plan lands second rebases without a semantic conflict.
- `CHANGELOG.md` is also edited by the issue #18 plan. Both append a bullet under `## [Unreleased]` → `### Added`, so the conflict is textual and trivial.

## Slice 01: Add client credentials pass-through

Objective: Carry an optional web-standard credential mode from client construction into every generated fetch request.

Owned paths: `src/client/types.ts`, `src/client/request.ts`, `src/client/create.ts`, `src/client/create.test.ts`, `docs/api.md`, `CHANGELOG.md`, `examples/gateway/src/run.ts`, `examples/gateway/README.md`

Steps:

1. Add `readonly credentials?: RequestCredentials` to `ClientOptions`.
2. Add a trailing optional `credentials` parameter to `buildRequest` and set it on the constructed `RequestInit`. Keep `undefined` as `undefined`; substitute no default.
3. Set it once, where `init` is first constructed, so it survives the body-method branch that reassigns `init.headers` and sets `init.body`.
4. Pass `options.credentials` from `callRoute` into `buildRequest`.
5. Add a test with `credentials: 'include'` on a GET route, asserting the fetch stub receives it.
6. Add a second assertion on a POST route, since `buildRequest` mutates `init` again for body methods and a GET-only test would not catch credentials being set in the wrong branch.
7. For the omission case, assert against the stub's actual call argument rather than `expect.objectContaining`, which cannot distinguish an absent key from `credentials: undefined`. If that distinction is not worth asserting, state so and skip it instead of writing a check that always passes.
8. Update the `ClientOptions` block in `docs/api.md` and note that omitting the option leaves the underlying fetch implementation's default in force.
9. Add an `Added` entry under `## [Unreleased]` in `CHANGELOG.md`, written for a cookie-authenticated consumer deciding whether to upgrade, referencing issue #17.
10. Show `credentials: 'include'` on the in-process gateway `createClient` and note it in `examples/gateway/README.md`.

Acceptance checks:

- The focused client test passes, covering a query method and a body method.
- Typecheck, lint, and build pass.
- Behaviour is unchanged for clients that pass a custom `fetch` and no `credentials`.
- `CHANGELOG.md` has an `## [Unreleased]` entry.

## Follow-ups (outside this slice)

- Version bump and tag: releases publish only when a pushed `v*` tag matches `package.json`, and this slice deliberately does not touch `package.json`. The reporter asked specifically about a patch release.
- Reply on [issue #17](https://github.com/project-eddy/never-rest/issues/17) once released, confirming that omission preserves the browser default so no wrapper is needed.
