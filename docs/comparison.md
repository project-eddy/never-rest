---
title: Comparison
description: never-rest versus ts-rest and oRPC — versions, trade-offs, and when to prefer each.
---

# Comparison

Checkable anchors as of project research (August 2026). Re-verify versions before citing externally.

## Summary

| | never-rest | ts-rest | oRPC | tRPC | Hono RPC |
| --- | --- | --- | --- | --- | --- |
| Contract shape | Plain object + `as const satisfies ContractDef` | `initContract()` builder / `c.router()` | Procedure router | Procedure router | Chained `app` routes + validators |
| Handler model | `Result` / `ResultAsync` | Throws (middleware catches) | **Throw** `errors.NOT_FOUND()` on server | **Throw** `TRPCError` | Throws or raw `Response` |
| Client model | `ResultAsync`, composable | Varies by adapter | `safe()` tuple; no `andThen` chain | Promise + `try/catch` on client | Typed client; varies by setup |
| Validation | Standard Schema (bring your validator) | Zod-first; Zod 4 gaps in shipped types | Standard Schema | Zod (typical) | Zod / Valibot (typical) |
| Middleware | None — auth/gates are `andThen` in the handler | Built-in interceptors | Built-in | Built-in | Hono middleware stack |
| Node / local | `./node` `toNodeHandler`; `./local` `createLocalClient` / `createDispatcher` | Adapters (Express, …) | Adapters / plugins | Adapters | Hono-native |
| Type cost (20-route fixture, per route) | Spike ~1,346; budget 1,800 | ~5,984 (`c.router()`) | Not published by oRPC | Not published | Not published |
| Plain object control | ~1,193 per route (no library) | — | — | — | — |

Instantiation numbers for never-rest and ts-rest are measured in CI via `@ark/attest` — see [performance.md](./performance.md).

## ts-rest

**Reference:** `@ts-rest/core`, last stable release noted in primary-source research **2025-03-04**. Standard Schema line stalled at RC; v4 PR draft with failing CI at time of research.

**What ts-rest does better**

- Mature ecosystem: Express, Fastify, Next, OpenAPI paths, community adapters.
- Familiar `initContract()` DSL if the team already standardises on it.
- Broader documentation and examples.

**What never-rest optimises for**

- **Type budget:** measured cost sits in the DSL, not helpers — `c.router()` ~5,984 instantiations/route vs plain literals ~1,193 on the same 20-route fixture. never-rest is intentionally the plain-literal shape with typed client/server.
- **No throw path** for declared errors — no middleware to recover typed failures. Auth and
  permission gates are `andThen` in the handler ([concepts.md](./concepts.md#no-middleware--the-chain-is-the-middleware)).
- **Graded disclosure** as a function, not documentation warnings alone.
- **Cause chains** across services as serialisable data.
- **The same `ContractDef` without HTTP** — `createLocalClient` / `createDispatcher` keep the railway and schemas when the caller is in-process or the host already carries the operation as a string.

**When to stay on ts-rest:** you need ts-rest's adapter ecosystem today, or the team will not adopt `Result` handlers. never-rest now exports OpenAPI from the contract via `toOpenAPI` — compare feature parity before choosing.

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
- **HTTP contract-first** with declared status codes per route, not procedure-centric RPC. The same contract also dispatches in-process via `./local` when HTTP is not the host.

oRPC's own docs warn repeatedly not to put sensitive data in `ORPCError.data`; never-rest's `disclose()` encodes redaction policy.

**When to stay on oRPC:** RPC fits your API shape, you rely on throw-based server handlers, or you need oRPC's streaming/plugin surface.

## tRPC

**Reference:** [trpc.io](https://trpc.io) — end-to-end typesafe RPC over HTTP, Zod-typical, procedure router with middleware.

**What tRPC does better**

- Large ecosystem, React Query integration, subscriptions, and framework adapters.
- Familiar procedure model if the team already standardises on tRPC routers.
- Input/output inference without maintaining explicit HTTP paths per operation.

**What never-rest optimises for**

- **HTTP contract-first** with explicit `method` + `path` and declared status codes per route — REST-shaped APIs, not procedure namespaces. `./local` still uses that contract; it drops the HTTP projection, not the operation names.
- **`Result` handlers and `ResultAsync` clients** — no `TRPCError` throws; failures compose with `andThen` / `match` on both sides.
- **Graded disclosure** and **cause chains** as first-class wire data for gateways and agents.

**When to stay on tRPC:** your API is procedure-centric, you want tRPC's client integrations, or the team will not adopt `Result` at the boundary.

## Hono RPC

**Reference:** [Hono RPC](https://hono.dev/docs/guides/rpc) — type inference from Hono route chains; client calls mirror server `app` composition.

**What Hono RPC does better**

- Native Hono stack — middleware, bindings, and deployment targets Hono already targets.
- Types flow from the same `app` instance; no separate contract object.
- Lightweight when the API is already a Hono app.

**What never-rest optimises for**

- **Runtime-agnostic `fetch`** — same contract on Workers, Node, Deno, and frameworks via `serve` / `toNodeHandler`, not Hono-specific chaining. Same contract in-process via `./local` when there is no HTTP host.
- **`Result` at the boundary** instead of throw middleware or ad-hoc `Response` construction in handlers.
- **Cross-service error intelligence** — `origin`, `cause`, `nextStep`, and disclosure levels for multi-hop systems.

**When to stay on Hono RPC:** the API lives entirely in Hono, you want RPC inference from route chains, and graded disclosure / cause chains are unnecessary.

## never-rest

**Best fit**

- Web-standard `Request → Response` without framework adapters.
- The same contract in-process (`createLocalClient`) or behind a string-addressed host (`createDispatcher`) — NDJSON, MCP stdio, agent tool calls.
- Multi-service systems where downstream failures must bubble with cause intact.
- Agent or internal tooling that consumes structured failures, `ctx`, and `nextStep`.
- Teams already on `neverthrow` who want the same railway at HTTP and at in-process boundaries.
- TypeScript projects where **published instantiation per route** matters in CI.

**Not in scope today**

Middleware, streaming, multipart, CLI/codegen, wildcards/nested routers. A thin Node bridge (`./node` → `toNodeHandler`) ships for Express/`http`; full framework adapter suites are out of scope. File uploads and SSE in *your* app: [files and streams](./files-and-streams.md) — JSON on the railway, bytes on a host handler. `./local` is not a second protocol: the contract still declares HTTP method, path, and status maps; local dispatch ignores the statuses.

**Also in the package:** OpenAPI 3.1 export via `toOpenAPI(contract, { info })` from the contract alone; a Result-preserving `./query` adapter (`createQueryOptions`, `createMutationOptions`, `isRetryable`) for TanStack Query-shaped caches — errors stay as data, never thrown across the cache boundary. `RailError.ctx` carries structured diagnostic context at `full` and `internal`.
