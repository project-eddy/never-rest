# Plan: Examples teach protocol advantages

Mission: Reframe every example around one thesis — the contract is law at every HTTP boundary — so learners see why never-rest beats throw-based APIs, with runnable demos in smoke and gateway rather than duplicating protocol logic in each framework mount.

Definition of done:

- Learning path in `examples/README.md` and `docs/examples.md` opens with the thesis and maps four lessons to protocol wins.
- Shared-contract README/comments explain host vs domain status codes; `unavailable` is client-only.
- Every framework README shares a **Protocol win** block; mounts stay thin.
- Smoke asserts domain `not_found` vs host `route_not_found`, plus a local mini-contract for parsed output, undeclared → `internal` + public default, and client `unavailable`.
- Gateway demos graded disclosure, omitted → `public` default, `ClientErrorOf` / `unavailable`, and keeps `chain` + `credentials`.
- Validators README notes schemas are wire law for input and always-on parsed output.
- `CHANGELOG.md` has an `### Internal` Unreleased bullet; `examples:typecheck`, `examples:smoke`, and `docs:build` pass.

Validation:

```bash
pnpm examples:typecheck && pnpm examples:smoke && pnpm docs:build
```

## Thesis

**The contract is law at every HTTP boundary.** Handlers return `Result`; wire shapes are schema-parsed; host failures are distinct from domain failures; clients get an honest `ClientErrorOf` union; disclosure defaults to fail-closed (`public`).

| Lesson | Protocol win to teach |
| --- | --- |
| 1 Shared contract | Complete status map = protocol surface: domain codes + `validation_error` / `internal` / `route_not_found`; `unavailable` is client-only |
| 2 Framework stacks | Same law mounts anywhere; omitted `disclosure` → `public`; unmatched path ≠ resource missing |
| 3 Gateway | Cross-service honesty: `chain`, graded disclosure, `ClientErrorOf` including synthesised `unavailable` |
| 4 Validators | Schemas *are* the wire law — input validation + always-on parsed output |

## Scope

### Narrative

1. Rewrite `examples/README.md` and mirror in `docs/examples.md`.
2. Upgrade `examples/packages/shared-contract/README.md` + comments in `contract.ts`.
3. Shared **Protocol win** block in express / hono / next / sveltekit / cloudflare READMEs.

### Runnable demos

1. Extend `examples/smoke/assert-users-contract.ts` with `GET /nope` → `route_not_found`.
2. Add `examples/smoke/protocol.test.ts` (local mini-contract): parsed output strip, undeclared → `internal` with cause at `full` / absent when disclosure omitted, client `unavailable`.
3. Expand `examples/gateway/src/run.ts` + README: fourth print without `disclosure`, failing-fetch `unavailable`, keep chain/credentials.
4. Validators README one-liner on wire output parse.

### Changelog

`## [Unreleased]` → `### Internal`: examples teaching refresh for 0.3.0 protocol wins.

## Non-goals

- No new `examples/protocol` package.
- No handler churn across next/sveltekit/workers.
- No advanced-usage / capability-type demos.
- No package version / release work.
