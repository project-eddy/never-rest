# never-rest behaviour specs

Gherkin scenarios for rule-shaped library behaviour: status mapping, graded
disclosure, cause chaining, and client result mapping. Type-level behaviour
(instantiation budgets, assignability) is **not** specified here — see `perf/`
and type tests (slice 06).

## Files

| Spec | Capability |
| --- | --- |
| [status-mapping.md](./status-mapping.md) | `statusFor`, `toDeclaredResponse`, `respond` — declared vs undeclared statuses |
| [graded-disclosure.md](./graded-disclosure.md) | `disclose` — full / internal / public redaction rules |
| [cause-chaining.md](./cause-chaining.md) | `chain`, `flatten`, `formatChain`, origin stamping, JSON round-trip |
| [client-results.md](./client-results.md) | `createClient` — `Ok` / `Err` mapping, short-circuit chains |

Each file follows the [utility-belt Gherkin convention](https://github.com/project-eddy/utility-belt/blob/main/mixins/gherkin/SKILL.md): YAML frontmatter, a job-story callout, overview prose, and one fenced `gherkin` block per scenario with **exactly one `When`**.

## Extraction

Pull machine-readable scenarios from the markdown specs:

```bash
# JSON (default) — one entry per file, scenarios tagged with heading + name
node scripts/extract-gherkin.mjs specs/

# Cucumber-style plain text
node scripts/extract-gherkin.mjs --feature specs/

# Single file
node scripts/extract-gherkin.mjs specs/status-mapping.md
```

Once slice 01 wires the package script:

```bash
pnpm specs:extract
```

JSON shape:

```json
[
  {
    "file": "specs/status-mapping.md",
    "frontmatter": { "title": "...", "domain": "...", "status": "draft" },
    "scenarios": [
      {
        "heading": "Declared status is returned",
        "name": "Mapping a declared error code to its HTTP status",
        "keyword": "Scenario",
        "text": "Scenario: ...\n  Given ..."
      }
    ]
  }
]
```

## Where scenarios land in tests

Specs are the source of truth. Implementation tests cite scenario **titles**
one-to-one — they do not invent parallel wording.

| Layer | Seams | Spec files |
| --- | --- | --- |
| Unit / integration | `statusFor`, `toDeclaredResponse`, `disclose`, `chain`, `flatten`, `respond` | `status-mapping.md`, `graded-disclosure.md`, `cause-chaining.md` |
| Integration | `serve` (origin stamping, disclosure per request) | `cause-chaining.md`, `graded-disclosure.md` |
| Integration | `createClient` against a stubbed or in-process handler | `client-results.md` |

Suggested test file mapping (slice 02–05 implementers):

| Test file | Scenarios from |
| --- | --- |
| `src/status.test.ts` | `status-mapping.md` |
| `src/disclose.test.ts` | `graded-disclosure.md` |
| `src/error.test.ts` | `cause-chaining.md` (chain, flatten, format, round-trip) |
| `src/respond.test.ts` | `status-mapping.md`, `graded-disclosure.md` (respond paths) |
| `src/server/serve.test.ts` | `cause-chaining.md` (origin), `graded-disclosure.md` (per-request disclosure) |
| `src/client/create.test.ts` | `client-results.md` |

### Agent workflow

1. Run `node scripts/extract-gherkin.mjs specs/` (or `pnpm specs:extract`).
2. For each scenario: one test named after the scenario title.
3. `Given` → arrange; `When` → single call; each `Then` / `But` → assertion.
4. Leave the markdown spec in place; tests link back by name.
