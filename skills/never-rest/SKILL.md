---
name: never-rest
description: Lookup index for @eddy-works/never-rest — HTTP contracts with Result handlers, RailError chains, and graded disclosure. Use when implementing or debugging never-rest servers, clients, error mapping, disclosure, or migration from ts-rest/oRPC.
---

# never-rest

Lookup index for `@eddy-works/never-rest`. Read the linked anchor; do not infer behaviour from ts-rest or oRPC.

## Question → doc

| Question | Where |
| --- | --- |
| Why Result at the HTTP boundary instead of throws? | [concepts.md — Railway at the boundary](docs/concepts.md#railway-at-the-boundary) |
| What is `RailError` and what fields does it carry? | [api.md — RailError (interface)](docs/api.md#railerror-interface) |
| How do I construct an error? | [api.md — railError (function)](docs/api.md#railerror-function) |
| How do I wrap a downstream error? | [api.md — chain](docs/api.md#chain) · [errors-as-intelligence.md — Gateway composition](docs/errors-as-intelligence.md#gateway-composition) |
| How do I walk or log a cause chain? | [api.md — flatten](docs/api.md#flatten) · [formatChain](docs/api.md#formatchain) |
| How do I map error codes to HTTP status? | [api.md — statusFor](docs/api.md#statusfor) |
| What happens if a status is not declared on the route? | [api.md — toDeclaredResponse](docs/api.md#todeclaredresponse) · [specs/status-mapping.md](specs/status-mapping.md) → `src/status.test.ts`, `src/respond.test.ts` |
| How do I turn a handler `Result` into status + body? | [api.md — respond](docs/api.md#respond) |
| What are disclosure levels and when to use each? | [concepts.md — Trust circles](docs/concepts.md#trust-circles-and-graded-disclosure) · [api.md — disclose](docs/api.md#disclose) · [specs/graded-disclosure.md](specs/graded-disclosure.md) → `src/disclose.test.ts`, `src/server/serve.test.ts` |
| How does `serve` pick disclosure per request? | [api.md — ServeOptions](docs/api.md#serveoptions) · [api.md — serve](docs/api.md#serve) |
| What is `nextStep` for agents? | [errors-as-intelligence.md](docs/errors-as-intelligence.md) |
| What is `origin` and who sets it? | [errors-as-intelligence.md — Origin](docs/errors-as-intelligence.md#origin) · [api.md — serve](docs/api.md#serve) |
| When is an error `retryable`? | [errors-as-intelligence.md — Retryable](docs/errors-as-intelligence.md#retryable) |
| How do I define a contract? | [api.md — ContractDef](docs/api.md#contractdef) · [api.md — RouteDef](docs/api.md#routedef) |
| How do I type input/output/errors for a route? | [api.md — InputOf](docs/api.md#inputof) · [OutputOf](docs/api.md#outputof) · [ErrorOf](docs/api.md#errorof) |
| How does validation work? | [api.md — parseInput](docs/api.md#parseinput) · [concepts.md — Errors as data](docs/concepts.md#errors-as-data) |
| How do I compile or match route paths? | [api.md — compilePath](docs/api.md#compilepath) · [matchPath](docs/api.md#matchpath) · [compileRoutes](docs/api.md#compileroutes) · [matchRoute](docs/api.md#matchroute) |
| What path patterns are supported? | [api.md — compilePath](docs/api.md#compilepath) (exact segments, single `:param`) |
| How do I implement a handler? | [api.md — Handler](docs/api.md#handler) · [api.md — Handlers](docs/api.md#handlers) |
| How do I expose the server on fetch? | [api.md — serve](docs/api.md#serve) |
| How do I create a typed client? | [api.md — createClient](docs/api.md#createclient) |
| How do I chain client calls with neverthrow? | [api.md — Client](docs/api.md#client) · [specs/client-results.md](specs/client-results.md) → `src/client/create.test.ts` |
| What does the client do on network failure? | [api.md — createClient](docs/api.md#createclient) · [specs/client-results.md](specs/client-results.md) |
| Type instantiation budget and ts-rest comparison? | [README.md — Type budget](README.md#type-budget) · [docs/performance.md](docs/performance.md) · [comparison.md](docs/comparison.md) |
| When should I use ts-rest instead? | [README.md — When not to use](README.md#when-not-to-use-this) · [comparison.md — ts-rest](docs/comparison.md#ts-rest) |
| When should I use oRPC instead? | [README.md — When not to use](README.md#when-not-to-use-this) · [comparison.md — oRPC](docs/comparison.md#orpc) |
| Migrate from ts-rest? | [migrating.md — From ts-rest](docs/migrating.md#from-ts-rest) |
| Migrate from oRPC? | [migrating.md — From oRPC](docs/migrating.md#from-orpc) |
| Migrate from throwing handlers? | [migrating.md — From throwing handlers](docs/migrating.md#from-throwing-handlers) |
| How do I run Gherkin specs? | [specs/README.md](specs/README.md) |
| Which spec file maps to which test? | [README.md — Specs](README.md#specs) · [specs/README.md](specs/README.md) |

## Export → doc

| Export | Module | Doc |
| --- | --- | --- |
| `RailIssue` | `.` | [api.md#railissue](docs/api.md#railissue) |
| `RailError` | `.` | [api.md#railerror-interface](docs/api.md#railerror-interface) |
| `railError` | `.` | [api.md#railerror-function](docs/api.md#railerror-function) |
| `chain` | `.` | [api.md#chain](docs/api.md#chain) |
| `flatten` | `.` | [api.md#flatten](docs/api.md#flatten) |
| `formatChain` | `.` | [api.md#formatchain](docs/api.md#formatchain) |
| `StatusMap` | `.` | [api.md#statusmap](docs/api.md#statusmap) |
| `statusFor` | `.` | [api.md#statusfor](docs/api.md#statusfor) |
| `toDeclaredResponse` | `.` | [api.md#todeclaredresponse](docs/api.md#todeclaredresponse) |
| `Disclosure` | `.` | [api.md#disclosure](docs/api.md#disclosure) |
| `disclose` | `.` | [api.md#disclose](docs/api.md#disclose) |
| `RespondOptions` | `.` | [api.md#respondoptions](docs/api.md#respondoptions) |
| `respond` | `.` | [api.md#respond](docs/api.md#respond) |
| `RouteDef` | `./contract` | [api.md#routedef](docs/api.md#routedef) |
| `ContractDef` | `./contract` | [api.md#contractdef](docs/api.md#contractdef) |
| `InputOf` | `./contract` | [api.md#inputof](docs/api.md#inputof) |
| `OutputOf` | `./contract` | [api.md#outputof](docs/api.md#outputof) |
| `ErrorOf` | `./contract` | [api.md#errorof](docs/api.md#errorof) |
| `parseInput` | `./contract` | [api.md#parseinput](docs/api.md#parseinput) |
| `CompiledPath` | `./contract` | [api.md#compiledpath](docs/api.md#compiledpath) |
| `compilePath` | `./contract` | [api.md#compilepath](docs/api.md#compilepath) |
| `matchPath` | `./contract` | [api.md#matchpath](docs/api.md#matchpath) |
| `CompiledRoute` | `./server` | [api.md#compiledroute](docs/api.md#compiledroute) |
| `RouteMatch` | `./server` | [api.md#routematch](docs/api.md#routematch) |
| `compileRoutes` | `./server` | [api.md#compileroutes](docs/api.md#compileroutes) |
| `matchRoute` | `./server` | [api.md#matchroute](docs/api.md#matchroute) |
| `Handler` | `./server` | [api.md#handler](docs/api.md#handler) |
| `Handlers` | `./server` | [api.md#handlers](docs/api.md#handlers) |
| `ServeOptions` | `./server` | [api.md#serveoptions](docs/api.md#serveoptions) |
| `serve` | `./server` | [api.md#serve](docs/api.md#serve) |
| `ClientOptions` | `./client` | [api.md#clientoptions](docs/api.md#clientoptions) |
| `Client` | `./client` | [api.md#client](docs/api.md#client) |
| `createClient` | `./client` | [api.md#createclient](docs/api.md#createclient) |

## Spec → topic → tests

| Spec file | Topic | Tests |
| --- | --- | --- |
| [specs/status-mapping.md](specs/status-mapping.md) | Declared vs undeclared statuses, 500 degradation | `src/status.test.ts`, `src/respond.test.ts` |
| [specs/graded-disclosure.md](specs/graded-disclosure.md) | `full` / `internal` / `public` leak cases | `src/disclose.test.ts`, `src/respond.test.ts`, `src/server/serve.test.ts` |
| [specs/cause-chaining.md](specs/cause-chaining.md) | Downstream bubble, `origin`, serialisation | `src/error.test.ts`, `src/server/serve.test.ts` |
| [specs/client-results.md](specs/client-results.md) | `Ok` / `Err` mapping, retryable network, short-circuit | `src/client/create.test.ts` |
| [specs/README.md](specs/README.md) | `pnpm specs:extract` (28 scenarios) | — |
