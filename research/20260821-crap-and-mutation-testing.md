# CRAP and mutation testing for never-rest

Date: 2026-08-21

## Sources

- Alberto Savoia and Bob Evans, *The Code C.R.A.P. Metric Hits the Fan* (2007): [artima.com](https://www.artima.com/weblogs/viewpost.jsp?thread=215899). Formula `CRAP(m) = comp(m)^2 * (1 – cov(m)/100)^3 + comp(m)`. Original method threshold **30**.
- Robert C. Martin, *Clean Code and Battle Scarred Architecture* (2009): [objectmentor.com](https://blog.objectmentor.com/articles/2009/05/20/clean-code-and-battle-scarred-architecture). Per-function CRAP; react to upticks by adding tests or extracting.
- Robert C. Martin, *Mutation Testing* (2016): [blog.cleancoder.com](https://blog.cleancoder.com/uncle-bob/2016/06/10/MutationTesting.html). Coverage is necessary but not sufficient; a semantic change must fail a test.
- Robert C. Martin, *Testing Like the TSA* (2017): [blog.cleancoder.com](https://blog.cleancoder.com/uncle-bob/2017/03/06/TestingLikeTheTSA.html). 100% coverage is an asymptotic goal.

Target for this library: **CRAP ≤ 8** per production function (at 100% coverage that is cyclomatic complexity ≤ 8) plus mutation testing for semantic stability.

## Tooling

- `scripts/crap.mjs` — TypeScript AST complexity + Vitest Istanbul JSON coverage.
- `pnpm crap` fails if any production function scores CRAP > 8.
- ESLint `complexity: ["error", 8]` on production `src/**/*.ts`.
- StrykerJS + Vitest runner (`stryker.config.json`, `pnpm test:mutate`). `thresholds.break` is **67** (measured 68.67 minus a point).

## Baseline (before extracts) — 2026-08-21

Coverage: statements 91.23%, branches 87.33%, functions 96.83%, lines 91.23%.

Functions with CRAP > 8 (13 of 198):

| Function | File | CC | cov% | CRAP |
| --- | --- | --- | --- | --- |
| `toPathSegment` | `src/client/response.ts:111` | 8 | 0 | 72.00 |
| `parseRailErrorEnvelope` | `src/client/response.ts:35` | 24 | 79 | 29.37 |
| `valuesEqual` | `src/testing/transport.ts:7` | 14 | 68 | 20.58 |
| `processRequest` | `src/server/serve.ts:407` | 20 | 97 | 20.01 |
| `isValidIssue` | `src/client/response.ts:13` | 9 | 60 | 14.18 |
| `compileContract` | `src/contract/compile.ts:124` | 14 | 100 | 14.00 |
| `buildRequest` | `src/client/request.ts:181` | 12 | 84 | 12.60 |
| `disclose` | `src/disclose.ts:60` | 12 | 100 | 12.00 |
| `mapValidationResult` | `src/client/response.ts:144` | 5 | 35 | 11.87 |
| `appendQueryValue` | `src/client/request.ts:55` | 10 | 76 | 11.34 |
| `objectSchemaShape` | `src/openapi/schema.ts:69` | 8 | 71 | 9.57 |
| `stampOrigin` | `src/server/serve.ts:112` | 9 | 82 | 9.49 |
| `toPathSegment` | `src/contract/parse.ts:19` | 8 | 73 | 9.21 |

`toPathSegment` in `response.ts` showing 0% coverage is likely a coverage-map mismatch (the file is 73% covered overall); still CC=8 at the cap.

## After extracts — 2026-08-21

Every production function scores CRAP ≤ 8 (240 functions). Coverage floors: statements/lines 92, branches 88, functions 95.

`parseRailErrorEnvelope` now round-trips `ctx`.

## Mutation score — 2026-08-21

Full suite (~3.5 minutes locally, 9 workers):

| | total | covered | killed | timeout | survived | no cov |
| --- | --- | --- | --- | --- | --- | --- |
| All files | **68.67** | 75.00 | 1401 | 6 | 469 | 173 |

`src/error.ts` is 100% after stronger flatten tests (cycle uniqueness + depth cap). Remaining survivors cluster in `response.ts`, `request.ts`, `serve.ts`, and `assert-protocol.ts`. CI `thresholds.break` is 67. PRs run `stryker run --since` against the base ref; `main` runs the full suite.

