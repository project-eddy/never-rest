---
name: never-rest
description: Lookup index for @eddy-works/never-rest — HTTP contracts with Result handlers, RailError chains, graded disclosure, and in-process dispatch. Use when implementing or debugging never-rest servers, clients, local/in-process boundaries, error mapping, disclosure, or migration from ts-rest/oRPC.
---

# never-rest

Lookup index for `@eddy-works/never-rest`. Read the linked anchor; do not infer behaviour from ts-rest or oRPC.

Keep each `ContractDef` in its own module (or shared package). Handlers, `serve`, and clients import it — they do not define it. See [contract modules](references/contract-modules.md).

## Question → doc

| Question | Where |
| --- | --- |
| Why Result at the boundary instead of throws? | [concepts.md — Railway at the boundary](docs/concepts.md#railway-at-the-boundary) |
| How do I use a contract without HTTP? | [concepts.md — One contract, more than HTTP](docs/concepts.md#one-contract-more-than-http) · [api.md — local](docs/api.md#eddy-worksnever-restlocal) |
| Where did middleware go — how do I do auth / permissions? | [concepts.md — No middleware](docs/concepts.md#no-middleware--the-chain-is-the-middleware) · [migrating.md — Middleware](docs/migrating.md#middleware) |
| How do I make auth / tenancy non-omittable without middleware? | [advanced-usage.md](docs/advanced-usage.md) |
| Capability types / `Session` required by domain? | [advanced-usage.md — Capability types](docs/advanced-usage.md#capability-types) |
| `withAuth` / `withRole` / `publicHandler` composers? | [advanced-usage.md — Composer wrappers](docs/advanced-usage.md#composer-wrappers) |
| Host wrap vs gateway vs handler railway? | [advanced-usage.md — What stays outside the railway](docs/advanced-usage.md#what-stays-outside-the-railway) |
| Gates, side effects, after-effects, provisioning chains? | [railway-patterns.md](docs/railway-patterns.md) |
| Router, recover, fan-out, lift, terminate, ROP links? | [railway-patterns.md](docs/railway-patterns.md) · [neverthrow](https://www.npmjs.com/package/neverthrow) · [Wlaschin ROP](https://fsharpforfunandprofit.com/rop/) |
| White-label tenant provisioning kitchen sink? | [railway-patterns.md — Kitchen sink](docs/railway-patterns.md#kitchen-sink--white-label-enterprise-tenant-provisioning) |
| What is `RailError` and what fields does it carry? | [api.md — RailError (interface)](docs/api.md#railerror-interface) |
| How do I keep my own diagnostic context on an error? | [api.md — RailError (interface)](docs/api.md#railerror-interface) (`ctx`) · [api.md — disclose](docs/api.md#disclose) (per-level table) |
| How do I construct an error? | [api.md — railError (function)](docs/api.md#railerror-function) |
| How do I wrap a downstream error? | [api.md — chain](docs/api.md#chain) · [errors-as-intelligence.md — Gateway composition](docs/errors-as-intelligence.md#gateway-composition) |
| How do I walk or log a cause chain? | [api.md — flatten](docs/api.md#flatten) · [formatChain](docs/api.md#formatchain) |
| How do I map error codes to HTTP status? | [api.md — statusFor](docs/api.md#statusfor) |
| What happens if a status is not declared on the route? | [api.md — toDeclaredResponse](docs/api.md#todeclaredresponse) · [specs/status-mapping.spec.md](specs/status-mapping.spec.md) → `src/status.test.ts`, `src/respond.test.ts` |
| How do I turn a handler `Result` into status + body? | [api.md — respond](docs/api.md#respond) |
| What are disclosure levels and when to use each? | [concepts.md — Trust circles](docs/concepts.md#trust-circles-and-graded-disclosure) · [api.md — disclose](docs/api.md#disclose) · [specs/graded-disclosure.spec.md](specs/graded-disclosure.spec.md) → `src/disclose.test.ts`, `src/server/serve.test.ts` |
| How does `serve` pick disclosure per request? | [api.md — ServeOptions](docs/api.md#serveoptions) · [api.md — serve](docs/api.md#serve) |
| What is `nextStep` for agents? | [errors-as-intelligence.md](docs/errors-as-intelligence.md) |
| What is `origin` and who sets it? | [errors-as-intelligence.md — Origin](docs/errors-as-intelligence.md#origin) · [api.md — serve](docs/api.md#serve) |
| When is an error `retryable`? | [errors-as-intelligence.md — Retryable](docs/errors-as-intelligence.md#retryable) |
| How do I define a contract? | [api.md — ContractDef](docs/api.md#contractdef) · [api.md — RouteDef](docs/api.md#routedef) |
| Where should the contract live? | [references/contract-modules.md](references/contract-modules.md) · [shared-contract](examples/packages/shared-contract) · [gateway contract](examples/gateway/src/contract.ts) |
| How do I type input/output/errors for a route? | [api.md — ClientArgsOf](docs/api.md#clientargsof) · [HandlerArgsOf](docs/api.md#handlerargsof) · [OutputOf](docs/api.md#outputof) · [ErrorOf](docs/api.md#errorof) · [ClientErrorOf](docs/api.md#clienterrorof) |
| How do I name client args from the contract? | [api.md — ClientArgsOf](docs/api.md#clientargsof) |
| How do I prove an output schema is transport-stable? | [api.md — checkTransportStability](docs/api.md#checktransportstability) · [api.md — checkContractOutputs](docs/api.md#checkcontractoutputs) · [migrating.md — Output schemas](docs/migrating.md#output-schemas--transport-stability) |
| What error codes can the client return? | [api.md — ClientErrorOf](docs/api.md#clienterrorof) · [specs/client-results.spec.md](specs/client-results.spec.md) |
| Where do HTTP statuses live? | [api.md — RouteDef](docs/api.md#routedef) · [api.md — HostStatuses](docs/api.md#hoststatuses) · [migrating.md — Status map relocation](docs/migrating.md#status-map-relocation) |
| What happens on unmatched routes? | [api.md — serve](docs/api.md#serve) · [specs/status-mapping.spec.md](specs/status-mapping.spec.md) (`route_not_found`) |
| How does output validation work on the server? | [api.md — serve](docs/api.md#serve) · [specs/server-output-validation.spec.md](specs/server-output-validation.spec.md) |
| How does validation work? | [api.md — parseRouteSources](docs/api.md#parseroutesources) · [concepts.md — Errors as data](docs/concepts.md#errors-as-data) |
| How do I compile or match route paths? | [api.md — compileContract](docs/api.md#compilecontract) · [isContractPath](docs/api.md#iscontractpath) · [compilePath](docs/api.md#compilepath) · [matchPath](docs/api.md#matchpath) · [normalizePath](docs/api.md#normalizepath) · [compileRoutes](docs/api.md#compileroutes) · [matchRoute](docs/api.md#matchroute) |
| What path patterns are supported? | [api.md — compilePath](docs/api.md#compilepath) (exact segments, single `:param`; static before dynamic) |
| Migrate from 0.4.x? | [migrating.md — Upgrading from 0.4.x](docs/migrating.md#upgrading-from-04x) |
| Migrate from 0.4.0? | [migrating.md — Upgrading from 0.4.0](docs/migrating.md#upgrading-from-040) |
| Migrate from 0.3.0? | [migrating.md — Upgrading from 0.3.0](docs/migrating.md#upgrading-from-030) |
| How do I implement a handler? | [api.md — Handler](docs/api.md#handler) · [api.md — Handlers](docs/api.md#handlers) |
| How do I expose the server on fetch? | [api.md — serve](docs/api.md#serve) |
| How do I mount next to pages or another router? | [api.md — ServeHandler](docs/api.md#servehandler) · [migrating.md — Shared-process mounting](docs/migrating.md#shared-process-mounting) · [examples/sveltekit](examples/sveltekit) |
| How do I upload files or run SSE? | [files-and-streams.md](docs/files-and-streams.md) · [examples/files-and-streams](examples/files-and-streams) |
| How do I mount on Node http / Express? | [api.md — toNodeHandler](docs/api.md#tonodehandler) · [examples/express](examples/express) |
| Where are runnable framework examples? | [examples/README.md](examples/README.md) · [docs/examples.md](docs/examples.md) |
| How do I call a contract in-process, with no HTTP? | [api.md — local](docs/api.md#eddy-worksnever-restlocal) · [specs/local-dispatch.spec.md](specs/local-dispatch.spec.md) |
| `createLocalClient` or `createTestClient`? | `createLocalClient` is a production transport that skips HTTP entirely; `createTestClient` exercises the real `serve` path in tests. [api.md — createLocalClient](docs/api.md#createlocalclient) · [createTestClient](docs/api.md#createtestclient) |
| How do I put a contract behind a socket, MCP stdio, or a tool call? | [api.md — createDispatcher](docs/api.md#createdispatcher) |
| How do I create a typed client? | [api.md — createClient](docs/api.md#createclient) |
| How do I use the client with TanStack Query? | [api.md — query](docs/api.md#eddy-worksnever-restquery) · [railway-patterns.md — Terminate](docs/railway-patterns.md#terminate--dead-end) |
| How do I chain client calls with neverthrow? | [api.md — Client](docs/api.md#client) · [specs/client-results.spec.md](specs/client-results.spec.md) → `src/client/create.test.ts` |
| What does the client do on network failure? | [api.md — createClient](docs/api.md#createclient) · [specs/client-results.spec.md](specs/client-results.spec.md) |
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
| `HostStatuses` | `.` | [api.md#hoststatuses](docs/api.md#hoststatuses) |
| `HOST_STATUSES` | `.` | [api.md#hoststatuses](docs/api.md#hoststatuses) |
| `StatusMap` | `.` | [api.md#statusmap](docs/api.md#statusmap) |
| `statusFor` | `.` | [api.md#statusfor](docs/api.md#statusfor) |
| `toDeclaredResponse` | `.` | [api.md#todeclaredresponse](docs/api.md#todeclaredresponse) |
| `Disclosure` | `.` | [api.md#disclosure](docs/api.md#disclosure) |
| `disclose` | `.` | [api.md#disclose](docs/api.md#disclose) |
| `RespondOptions` | `.` | [api.md#respondoptions](docs/api.md#respondoptions) |
| `respond` | `.` | [api.md#respond](docs/api.md#respond) |
| `RouteDef` | `./contract` | [api.md#routedef](docs/api.md#routedef) |
| `ContractDef` | `./contract` | [api.md#contractdef](docs/api.md#contractdef) |
| `compileContract` | `./contract` | [api.md#compilecontract](docs/api.md#compilecontract) |
| `isContractPath` | `./contract` | [api.md#iscontractpath](docs/api.md#iscontractpath) |
| `ContractConfigurationError` | `./contract` | [api.md#contractconfigurationerror](docs/api.md#contractconfigurationerror) |
| `assertHandlersComplete` | `./contract` | [api.md#asserthandlerscomplete](docs/api.md#asserthandlerscomplete) |
| `ClientArgsOf` | `./contract` | [api.md#clientargsof](docs/api.md#clientargsof) |
| `HandlerArgsOf` | `./contract` | [api.md#handlerargsof](docs/api.md#handlerargsof) |
| `OutputOf` | `./contract` | [api.md#outputof](docs/api.md#outputof) |
| `ErrorOf` | `./contract` | [api.md#errorof](docs/api.md#errorof) |
| `ClientErrorOf` | `./contract` | [api.md#clienterrorof](docs/api.md#clienterrorof) |
| `ServerErrorOf` | `./contract` | [api.md#servererrorof](docs/api.md#servererrorof) |
| `parseRouteSources` | `./contract` | [api.md#parseroutesources](docs/api.md#parseroutesources) |
| `parseOutput` | `./contract` | [api.md#parseoutput](docs/api.md#parseoutput) |
| `CompiledPath` | `./contract` | [api.md#compiledpath](docs/api.md#compiledpath) |
| `PathMatch` | `./contract` | [api.md#matchpath](docs/api.md#matchpath) |
| `compilePath` | `./contract` | [api.md#compilepath](docs/api.md#compilepath) |
| `matchPath` | `./contract` | [api.md#matchpath](docs/api.md#matchpath) |
| `normalizePath` | `./contract` | [api.md#normalizepath](docs/api.md#normalizepath) |
| `CompiledRoute` | `./server` | [api.md#compiledroute](docs/api.md#compiledroute) |
| `RouteMatch` | `./server` | [api.md#routematch](docs/api.md#routematch) |
| `compileRoutes` | `./server` | [api.md#compileroutes](docs/api.md#compileroutes) |
| `matchRoute` | `./server` | [api.md#matchroute](docs/api.md#matchroute) |
| `Handler` | `./server` | [api.md#handler](docs/api.md#handler) |
| `Handlers` | `./server` | [api.md#handlers](docs/api.md#handlers) |
| `ServeHandler` | `./server` | [api.md#servehandler](docs/api.md#servehandler) |
| `ServeOptions` | `./server` | [api.md#serveoptions](docs/api.md#serveoptions) |
| `serve` | `./server` | [api.md#serve](docs/api.md#serve) |
| `assertProtocolResponse` | `./server` / `./testing` | [api.md#assertprotocolresponse](docs/api.md#assertprotocolresponse) |
| `ClientOptions` | `./client` | [api.md#clientoptions](docs/api.md#clientoptions) |
| `Client` | `./client` | [api.md#client](docs/api.md#client) |
| `createClient` | `./client` | [api.md#createclient](docs/api.md#createclient) |
| `buildRequest` | `./client` | [api.md#buildrequest](docs/api.md#buildrequest) |
| `createLocalClient` | `./local` | [api.md#createlocalclient](docs/api.md#createlocalclient) |
| `createDispatcher` | `./local` | [api.md#createdispatcher](docs/api.md#createdispatcher) |
| `LocalOptions` | `./local` | [api.md#localoptions](docs/api.md#localoptions) |
| `LocalHandler` | `./local` | [api.md#localhandler](docs/api.md#localhandler) |
| `LocalHandlers` | `./local` | [api.md#localhandler](docs/api.md#localhandler) |
| `LocalClient` | `./local` | [api.md#createlocalclient](docs/api.md#createlocalclient) |
| `LocalDispatcher` | `./local` | [api.md#createdispatcher](docs/api.md#createdispatcher) |
| `LocalErrorOf` | `./local` | [api.md#createlocalclient](docs/api.md#createlocalclient) |
| `LocalHostErrorCode` | `./local` | [api.md#createdispatcher](docs/api.md#createdispatcher) |
| `createTestClient` | `./testing` | [api.md#createtestclient](docs/api.md#createtestclient) |
| `checkTransportStability` | `./testing` | [api.md#checktransportstability](docs/api.md#checktransportstability) |
| `checkContractOutputs` | `./testing` | [api.md#checkcontractoutputs](docs/api.md#checkcontractoutputs) |
| `ContractOutputSamples` | `./testing` | [api.md#checkcontractoutputs](docs/api.md#checkcontractoutputs) |
| `toOpenAPI` | `./openapi` | [api.md#toopenapi](docs/api.md#toopenapi) |
| `OpenApiExportError` | `./openapi` | [api.md#openapiexporterror](docs/api.md#openapiexporterror) |
| `createQueryOptions` | `./query` | [api.md#createqueryoptions](docs/api.md#createqueryoptions) |
| `createMutationOptions` | `./query` | [api.md#createmutationoptions](docs/api.md#createmutationoptions) |
| `isRetryable` | `./query` | [api.md#isretryable](docs/api.md#isretryable) |
| `toNodeHandler` | `./node` | [api.md#tonodehandler](docs/api.md#tonodehandler) |
| `FetchHandler` | `./node` | [api.md#fetchhandler](docs/api.md#fetchhandler) |
| `NodeHttpHandler` | `./node` | [api.md#nodehttphandler](docs/api.md#nodehttphandler) |

## Spec → topic → tests

| Spec file | Topic | Tests |
| --- | --- | --- |
| [specs/status-mapping.spec.md](specs/status-mapping.spec.md) | Declared vs undeclared statuses, `route_not_found` | `src/status.test.ts`, `src/respond.test.ts`, `src/server/serve.test.ts` |
| [specs/graded-disclosure.spec.md](specs/graded-disclosure.spec.md) | `full` / `internal` / `public` leak cases | `src/disclose.test.ts`, `src/respond.test.ts`, `src/server/serve.test.ts` |
| [specs/cause-chaining.spec.md](specs/cause-chaining.spec.md) | Downstream bubble, `origin`, serialisation | `src/error.test.ts`, `src/server/serve.test.ts` |
| [specs/client-results.spec.md](specs/client-results.spec.md) | `Ok` / `Err` mapping, `ClientErrorOf`, retryable network | `src/client/create.test.ts` |
| [specs/server-output-validation.spec.md](specs/server-output-validation.spec.md) | Always-on parsed output serialisation | `src/server/serve.test.ts` |
| [specs/contract-compilation.spec.md](specs/contract-compilation.spec.md) | `compileContract`, path decode, handler completeness, `isContractPath` | `src/contract/compile.test.ts`, `src/contract/path.test.ts`, `src/server/serve.test.ts` |
| [specs/input-sources.spec.md](specs/input-sources.spec.md) | `params` / `query` / `body` split, `parseRouteSources` | `src/contract/compile.test.ts`, `src/contract/parse.test.ts` |
| [specs/wire-serialization.spec.md](specs/wire-serialization.spec.md) | Client path/query wire encoding | `src/client/create.test.ts` |
| [specs/openapi-export.spec.md](specs/openapi-export.spec.md) | OpenAPI 3.1 from the contract | `src/openapi/to-openapi.test.ts` |
| [specs/local-dispatch.spec.md](specs/local-dispatch.spec.md) | In-process client and operation dispatch, no `Request` / `Response` | `src/local/dispatch.test.ts` |
| [specs/README.md](specs/README.md) | `pnpm specs:extract` | — |
