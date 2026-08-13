# never-rest behaviour specs

Gherkin scenarios for rule-shaped library behaviour: status mapping, graded
disclosure, cause chaining, client result mapping, contract compilation, and
wire serialization. Type-level behaviour (instantiation budgets, assignability) is
**not** specified here — see `perf/` and type tests.

Spec files use the `*.spec.md` suffix so they stay distinct from handbook and
docs markdown. Lint them with `pnpm specs:lint` (also run by the pre-commit hook).

## Files

| Spec | Capability |
| --- | --- |
| [status-mapping.spec.md](./status-mapping.spec.md) | `statusFor`, `toDeclaredResponse`, `respond` — declared vs undeclared statuses, `HOST_STATUSES`, `route_not_found` |
| [graded-disclosure.spec.md](./graded-disclosure.spec.md) | `disclose` — full / internal / public; serve omitted→public |
| [cause-chaining.spec.md](./cause-chaining.spec.md) | `chain`, `flatten`, `formatChain`, origin stamping, JSON round-trip |
| [client-results.spec.md](./client-results.spec.md) | `createClient` — `Ok` / `Err` mapping, `ClientErrorOf`, short-circuit chains |
| [server-output-validation.spec.md](./server-output-validation.spec.md) | `serve` — always-on output validation; parsed schema value serialised; success 201/204 pairing |
| [contract-compilation.spec.md](./contract-compilation.spec.md) | `compileContract`, `assertHandlersComplete`, `matchPath` decode, `isContractPath` — duplicate matchers, trailing slashes, handler completeness, host path membership, params/query/body/headers rules, error-status range, success-output pairing |
| [input-sources.spec.md](./input-sources.spec.md) | Explicit `params` / `query` / `body` / `headers` on `RouteDef`, `parseRouteSources` — source independence, compile-time rejections |
| [wire-serialization.spec.md](./wire-serialization.spec.md) | Client `buildRequest` — path params, `key[]=` query arrays, pre-fetch validation errors |
| [railway-boundary.spec.md](./railway-boundary.spec.md) | neverthrow combinators at `serve` — gates, mapErr, tees, recover, fail-closed reserved codes |
| [openapi-export.spec.md](./openapi-export.spec.md) | `toOpenAPI` — contract-only OpenAPI 3.1; fail loudly when a validator cannot convert |

Each file follows the [utility-belt Gherkin convention](https://github.com/project-eddy/utility-belt/blob/main/mixins/gherkin/SKILL.md): YAML frontmatter, a job-story callout, overview prose, and one fenced `gherkin` block per scenario with **exactly one `When`**.

## Extraction

Pull machine-readable scenarios from the markdown specs:

```bash
# JSON (default) — one entry per file, scenarios tagged with heading + name
node scripts/extract-gherkin.mjs specs/

# Cucumber-style plain text
node scripts/extract-gherkin.mjs --feature specs/

# Single file
node scripts/extract-gherkin.mjs specs/status-mapping.spec.md
```

Lint the convention:

```bash
pnpm specs:lint
# or
node scripts/lint-gherkin.mjs specs/
```

```bash
pnpm specs:extract
```

JSON shape:

```json
[
  {
    "file": "specs/status-mapping.spec.md",
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
| Unit / integration | `statusFor`, `toDeclaredResponse`, `disclose`, `chain`, `flatten`, `respond` | `status-mapping.spec.md`, `graded-disclosure.spec.md`, `cause-chaining.spec.md` |
| Integration | `serve` (origin stamping, disclosure per request, `route_not_found`, output validation, forged codes, `handle()`, `basePath`) | `cause-chaining.spec.md`, `graded-disclosure.spec.md`, `server-output-validation.spec.md`, `status-mapping.spec.md` |
| Integration | `createClient` against a stubbed or in-process handler | `client-results.spec.md`, `wire-serialization.spec.md` |
| Unit | `compileContract`, `matchPath`, `assertHandlersComplete`, `isContractPath`, `parseRouteSources` | `contract-compilation.spec.md`, `input-sources.spec.md` |
| Unit | `toOpenAPI` | `openapi-export.spec.md` |

Suggested test file mapping:

| Test file | Scenarios from |
| --- | --- |
| `src/status.test.ts` | `status-mapping.spec.md` |
| `src/disclose.test.ts` | `graded-disclosure.spec.md` |
| `src/error.test.ts` | `cause-chaining.spec.md` (chain, flatten, format, round-trip) |
| `src/respond.test.ts` | `status-mapping.spec.md`, `graded-disclosure.spec.md` (respond paths) |
| `src/contract/compile.test.ts` | `contract-compilation.spec.md`, `input-sources.spec.md` (compile-time source rules) |
| `src/contract/parse.test.ts` | `input-sources.spec.md` (`parseRouteSources`) |
| `src/contract/path.test.ts` | `contract-compilation.spec.md` (path decode) |
| `src/server/serve.test.ts` | `cause-chaining.spec.md` (origin), `graded-disclosure.spec.md` (per-request disclosure, omitted→public, forged codes), `server-output-validation.spec.md`, `status-mapping.spec.md` (`route_not_found`, `handle()`), `contract-compilation.spec.md` (handler completeness) |
| `src/client/create.test.ts` | `client-results.spec.md`, `wire-serialization.spec.md` |
| `src/testing/transport.test.ts` | transport-stability helpers (complements `server-output-validation.spec.md`) |
| `src/testing/client.test.ts` | `createTestClient` (in-process `serve` + `createClient`) |
| `src/openapi/to-openapi.test.ts` | `openapi-export.spec.md` |

### Agent workflow

1. Run `node scripts/extract-gherkin.mjs specs/` (or `pnpm specs:extract`).
2. For each scenario: one test named after the scenario title.
3. `Given` → arrange; `When` → single call; each `Then` / `But` → assertion.
4. Leave the markdown spec in place; tests link back by name.
