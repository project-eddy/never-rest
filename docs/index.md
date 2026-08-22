---
title: Documentation
description: never-rest docs — Result-based contracts on HTTP and in-process, graded disclosure, and a published type budget.
---

# Documentation

**An opinionated architectural choice** — never-rest puts Result-based railway-oriented programming at the API boundary. Whether either side uses railway style internally is up to that team; the contract assumes at least one side wants `Result` at the edge.

A `ContractDef` where handlers return `Result` instead of throwing. `serve` projects that onto HTTP. `./local` runs the same contract in-process, or behind a host that already carries the operation as a string. Errors carry their cause chain across boundaries. Disclosure is graded by caller trust.

| Doc | Topic |
| --- | --- |
| [Concepts](./concepts.md) | Railway at the boundary, HTTP and local transports, no middleware, errors as data, trust circles |
| [Railway patterns](./railway-patterns.md) | Full railway/neverthrow pattern catalogue + white-label tenant kitchen sink |
| [Advanced usage](./advanced-usage.md) | Policy without middleware — capabilities, composers, host wraps, agents |
| [API reference](./api.md) | Every public export, signature, example — including [`./local`](./api.md#eddy-worksnever-restlocal) |
| [Examples](./examples.md) | Express, Next, SvelteKit, Hono, Workers, gateway, files-and-streams |
| [Files and streams](./files-and-streams.md) | JSON on the railway; multipart and SSE on the host |
| [Errors as intelligence](./errors-as-intelligence.md) | `nextStep`, `origin`, `retryable`, `ctx`, gateway chains |
| [Comparison](./comparison.md) | vs ts-rest, oRPC, tRPC, and Hono RPC |
| [Migrating](./migrating.md) | From ts-rest, oRPC, throwing handlers |
| [Type performance](./performance.md) | Instantiation budget and CI gate |

Package: [`@eddy-works/never-rest`](https://www.npmjs.com/package/@eddy-works/never-rest) · Source: [project-eddy/never-rest](https://github.com/project-eddy/never-rest)
