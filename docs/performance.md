---
title: Type performance budget
description: Published per-route TypeScript instantiation budget and how CI enforces it.
---

# Type performance budget

never-rest publishes a **per-route TypeScript instantiation budget** and enforces it in CI. The goal is to keep contract-first ergonomics without the DSL tax of builder chains like `@ts-rest/core`'s `c.router()`.

**Budget: under 1,800 instantiations per route** (marginal slope on synthetic fixtures).

## Measured results (in-repo, real `src` types)

| Item | Value |
| --- | --- |
| TypeScript | 5.9.3 |
| `@ark/attest` | 0.56.3 |
| Fixture route counts | 1, 5, 20, 40 |
| Method | Isolated per-file `bench(...).types()`; routes defined inside each bench arrow |

### Per-route slope (linear regression on 1 / 5 / 20 / 40)

| Series | Intercept (fixed) | Per-route slope | Verdict |
| --- | --- | --- | --- |
| Contract `as const satisfies ContractDef` | 74,915 | **584** | PASS |
| `Client<TContract>` | 74,921 | **584** | PASS |
| Combined (contract + client) | 74,921 | **584** | PASS |
| `Handlers<TContract>` (serve surface) | 74,925 | **584** | PASS |
| Plain object control | 74,870 | 308 | — |

Marginal deltas vs contract-only at 40 routes:

- `Client<T>`: **+6** total (not per route)
- `Handlers<T>`: **+10** total

The gated series is **combined** (hand-written contract + one-level `Client<T>` consumption).

### Absolute instantiation counts (bench body contribution)

Each cell is `@ark/attest` contributed instantiations for that isolated bench file.

| Routes | Contract | Client | Combined | Plain control | Handlers |
| --- | --- | --- | --- | --- | --- |
| 1 | 75,499 | 75,505 | 75,505 | 75,178 | 75,509 |
| 5 | 77,835 | 77,841 | 77,841 | 76,410 | 77,845 |
| 20 | 86,595 | 86,601 | 86,601 | 81,030 | 86,605 |
| 40 | 98,275 | 98,281 | 98,281 | 87,190 | 98,285 |

Absolute totals include a large fixed overhead (~75k) from importing never-rest's type graph once per bench file. **The budget is on marginal per-route slope**, not total file cost.

## Comparison to research anchors

| Anchor | Per-route | Ratio vs never-rest (combined) |
| --- | --- | --- |
| Plain object literals (primary-source research) | ~1,193 | 0.49× (fixtures differ; see note) |
| `@ts-rest/core` `c.router()` (research) | ~5,984 | **~10× cheaper** |
| Published budget | 1,800 | **PASS** (584 < 1,800) |

Research anchors used lighter fixtures (minimal literals, no Zod per route). This harness uses Zod + Standard Schema stubs on every route so slopes are comparable across contract / client / serve surfaces in one repo. The spike on stub types (`.tmp/spike/MEASUREMENT.md`) measured **~1,346/route** with lower fixed overhead; in-repo measurement against real `src` types is **~584/route** — both well under budget.

## Budget verdict

| Check | Result |
| --- | --- |
| Combined contract + client ≤ 1,800 / route | **PASS** (~584) |
| Within ~1.5× plain literals (~1,193) | **PASS** |
| ≥ 3× cheaper than ts-rest (~5,984) | **PASS** (~10×) |
| Safe to ship v0.1 type surface | **YES** |

## Which construct dominates cost?

Not `Client` (+6 fixed). Not `Handlers` (+10). Per-route cost is dominated by **per-route schema inference** (`StandardSchemaV1.InferOutput` via `HandlerArgsOf` / `OutputOf`) and the **Zod object schemas** in each route fixture — the same work plain object literals do, plus a small premium for `as const satisfies ContractDef` vs the plain control (~276/route marginal delta: 584 − 308).

## Reproduce

```bash
# Regenerate isolated bench files (after editing perf/generate-benches.mjs)
node perf/generate-benches.mjs

# Establish or refresh inline attest snapshots (after fixture or src type changes)
cd perf && ATTEST_updateSnapshots=1 node --experimental-strip-types benches/combined-20.bench.ts

# CI gate (also validates slope from perf/baseline.json)
node scripts/typeperf.mjs

# Verify the gate catches runaway instantiations
node scripts/typeperf.mjs --self-test
```

After changing fixtures or `src` types, re-run all benches with `ATTEST_updateSnapshots=1`, recompute slopes, and update `perf/baseline.json`.

### On-demand trace (not CI)

```bash
node scripts/typeperf-trace.mjs
node scripts/typeperf-trace.mjs perf/benches/combined-20.bench.ts
```

## Layout

```
perf/
  baseline.json           # committed slopes, counts, TypeScript version
  fixtures/
    schema.ts             # Zod → Standard Schema helper
    plain-object.ts       # plain-object control types
  generate-benches.mjs    # one isolated bench file per measurement
  benches/*.bench.ts      # inline .types([N, "instantiations"]) snapshots
scripts/
  typeperf.mjs            # CI gate
  typeperf-trace.mjs      # optional tsc --generateTrace diagnostic
```

## Updating the baseline

1. Bump TypeScript only after re-measuring all benches.
2. Edit `perf/baseline.json` with new counts, intercepts, and slopes.
3. Do **not** raise `budgetPerRoute` quietly — if the budget cannot be met, escalate as a design finding.
