---
title: Documentation
description: never-rest docs — Result-based HTTP contracts, graded disclosure, and a published type budget.
---

# Documentation

**An opinionated architectural choice** — never-rest puts Result-based railway-oriented programming at the API boundary. Whether either side uses railway style internally is up to that team; the contract assumes at least one side wants `Result` at the edge.

HTTP contracts where handlers return `Result` instead of throwing. Errors carry their cause chain across service boundaries. Disclosure is graded by caller trust.

| Doc | Topic |
| --- | --- |
| [Concepts](./concepts.md) | Railway at the boundary, no middleware, errors as data, trust circles |
| [Railway patterns](./railway-patterns.md) | Full railway/neverthrow pattern catalogue + white-label tenant kitchen sink |
| [Advanced usage](./advanced-usage.md) | Policy without middleware — capabilities, composers, host wraps, agents |
| [API reference](./api.md) | Every public export, signature, example |
| [Examples](./examples.md) | Express, Next, SvelteKit, Hono, Workers, gateway |
| [Errors as intelligence](./errors-as-intelligence.md) | `nextStep`, `origin`, `retryable`, gateway chains |
| [Comparison](./comparison.md) | vs ts-rest, oRPC, tRPC, and Hono RPC |
| [Migrating](./migrating.md) | From ts-rest, oRPC, throwing handlers |
| [Type performance](./performance.md) | Instantiation budget and CI gate |

Package: [`@eddy-works/never-rest`](https://www.npmjs.com/package/@eddy-works/never-rest) · Source: [project-eddy/never-rest](https://github.com/project-eddy/never-rest)
