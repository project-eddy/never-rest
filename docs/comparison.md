---
title: Comparison
description: never-rest versus ts-rest and oRPC — versions, trade-offs, and when to prefer each.
---

# Comparison

Checkable anchors as of project research (August 2026). Re-verify versions before citing externally.

## Summary

| | never-rest | ts-rest | oRPC |
| --- | --- | --- | --- |
| Contract shape | Plain object + `satisfies ContractDef` | `initContract()` builder / `c.router()` | Procedure router |
| Handler model | `Result` / `ResultAsync` | Throws (middleware catches) | **Throw** `errors.NOT_FOUND()` on server |
| Client model | `ResultAsync`, composable | Varies by adapter | `safe()` tuple; no `andThen` chain |
| Validation | Standard Schema (bring your validator) | Zod-first; Zod 4 gaps in shipped types | Standard Schema |
| Middleware | None — auth/gates are `andThen` in the handler | Built-in interceptors | Built-in |
| Node bridge | `./node` `toNodeHandler` | Adapters (Express, …) | Adapters / plugins |
| Type cost (20-route fixture, per route) | Spike ~1,346; budget 1,800 | ~5,984 (`c.router()`) | Not published by oRPC |
| Plain object control | ~1,193 per route (no library) | — | — |

Instantiation numbers for never-rest and ts-rest are **provisional** until [performance.md](performance.md) publishes the full `@ark/attest` gate (slice 06).

## ts-rest

**Reference:** `@ts-rest/core`, last stable release noted in primary-source research **2025-03-04**. Standard Schema line stalled at RC; v4 PR draft with failing CI at time of research.

**What ts-rest does better**

- Mature ecosystem: Express, Fastify, Next, OpenAPI paths, community adapters.
- Familiar `initContract()` DSL if the team already standardises on it.
- Broader documentation and examples.

**What never-rest optimises for**

- **Type budget:** measured cost sits in the DSL, not helpers — `c.router()` ~5,984 instantiations/route vs plain literals ~1,193 on the same 20-route fixture. never-rest is intentionally the plain-literal shape with typed client/server.
- **No throw path** for declared errors — no middleware to recover typed failures. Auth and
  permission gates are `andThen` in the handler ([concepts.md](concepts.md#no-middleware--the-chain-is-the-middleware)).
- **Graded disclosure** as a function, not documentation warnings alone.
- **Cause chains** across services as serialisable data.

**When to stay on ts-rest:** you need OpenAPI generation today, existing ts-rest adapters, or the team will not adopt `Result` handlers.

## oRPC

**Reference:** [orpc.dev](https://orpc.dev) — RPC-oriented, Standard Schema, typed errors over the wire.

**What oRPC does better**

- RPC procedure model, plugins, and framework integrations beyond raw `fetch`.
- Streaming and advanced procedure features (out of scope for never-rest v0.1).
- Typed errors on the wire without custom envelope design.

**What never-rest optimises for**

- **Server handlers return `Result`**, not `throw errors.X()`. Failure composes in the handler body.
- **Client `ResultAsync`** — `client.getUser(id).andThen(loadOrders).map(toSummary)` typechecks; oRPC's `safe()` does not offer `map` / `andThen` / `match` on the result type.
- **Disclosure levels** (`full` / `internal` / `public`) for the same error payload.
- **HTTP contract-first** with declared status codes per route, not procedure-centric RPC.

oRPC's own docs warn repeatedly not to put sensitive data in `ORPCError.data`; never-rest's `disclose()` encodes redaction policy.

**When to stay on oRPC:** RPC fits your API shape, you rely on throw-based server handlers, or you need oRPC's streaming/plugin surface.

## never-rest

**Best fit**

- Web-standard `Request → Response` without framework adapters.
- Multi-service systems where downstream failures must bubble with cause intact.
- Agent or internal tooling that consumes structured failures and `nextStep`.
- Teams already on `neverthrow` who want the same railway at the HTTP edge.
- TypeScript projects where **published instantiation per route** matters in CI.

**Not in v0.1**

OpenAPI codegen, middleware, TanStack Query integrations, streaming, multipart, CLI/codegen, wildcards/nested routers. A thin Node bridge (`./node` → `toNodeHandler`) ships for Express/`http`; full framework adapter suites are out of scope. See the plan's exclusion table.
