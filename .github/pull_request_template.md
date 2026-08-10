## What changed

<!-- One or two sentences, from a consumer's point of view. Link the issue, e.g. Closes #17 -->

## Why

<!-- The problem this solves. Skip if the issue already covers it. -->

## Checklist

- [ ] `CHANGELOG.md` has an entry under `## [Unreleased]`. CI fails otherwise, with no skip label — use `### Internal` for chore, CI, Dependabot, and refactor work.
- [ ] Tests cover the change, citing `specs/` scenario titles one-to-one where a spec applies.
- [ ] `docs/api.md` updated for any public API change.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm perf:check && pnpm build` pass locally.
