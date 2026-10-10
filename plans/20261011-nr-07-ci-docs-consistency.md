# Plan: NR-07 CI, spec and docs consistency

Mission: make documented examples compile, supported runtimes match package
claims, and HTTP/local share one behaviour table.

Definition of done:

**NR-07a (first):**

- `pnpm docs:snippets` typechecks `<!-- check -->` fenced ts blocks in
  README, `docs/*.md`, and `skills/` against `src`.
- CI `check` job runs that script.
- `engines.node` is `>=22`; CI tests Node 22 and 24.
- `reports/` is gitignored.

**NR-07b (last):**

- `src/protocol/transport-parity.test.ts` runs one scenario table through
  `createTestClient` and `createDispatcher` (policy denials, disclosure,
  boundary codes, cancellation, validation).
- Bun and Deno smoke jobs cover `serve` bounded bodies and a client round
  trip.
- Specs: `bounded-ingress`, `operation-policy`, `boundary-errors`,
  `admission-limits`, `cancellation-retry`. README specs table updated.
- `docs/security-boundaries.md` covers admission order, deployment-owned
  controls, and what never-rest does not ship. `docs/meta.json` and the
  skill are updated.

Validation:

```bash
pnpm docs:snippets && pnpm specs:lint && pnpm test src/protocol
```

## What stays the same

Existing specs keep their titles. New behaviour gets new files, not silent
rewrites of old scenario names.
