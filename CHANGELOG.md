# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `RailError.ctx` — optional structured context for whoever reads the error, disclosed at `full` and `internal` and always stripped at `public`. The named fields cover what every caller needs (`retryable`, `nextStep`, `origin`); `ctx` carries what only the raising tool knows — which gate rejected, which category, which files were involved. Agent-facing tools are the main consumer of this library, and an agent choosing its next move needs that detail structured rather than flattened into `message`. Named `ctx` rather than `meta` because it is the error's context, not metadata about the error; kept separate from `issues`, which means validation paths and would be corrupted for every other consumer by overloading.
- Guide for file uploads and SSE: JSON stays on the railway; multipart and streams use sibling host handlers with `parseRouteSources` / `parseSchema` ([docs/files-and-streams.md](docs/files-and-streams.md)).
- In-process [`examples/files-and-streams`](examples/files-and-streams) — served JSON catalog, shadow `uploadMeta` `RouteDef`, `handle()` fallthrough for `POST /uploads` and `GET /jobs/:id/events`.

### Internal

- CI and release workflows run `svelte-kit sync` before example conformance so SvelteKit imports resolve in clean checkouts.
- Gateway example keeps `inventoryContract` and `ordersContract` as named exports in `src/contract.ts`; the never-rest skill records that layout as working convention.
- SvelteKit example splits railway (`src/handler.ts`) from the cooperative hook mount (`src/hooks.server.ts`).
- Next App Router example splits railway (`handler.ts`) from the catch-all mount (`app/api/[...path]/route.ts`).
- Framework examples persist users through `createUsersDb()`, which returns `ResultAsync` with contract `railError` codes so handlers stay on the railway.
- Implementation plan for the files-and-streams 0.6 follow-through (`plans/20260813-files-and-streams-0.6.md`).


## [0.5.0] - 2026-08-13

### Added

- `params?`, `query?`, `body?`, and `headers?` on `RouteDef` — each optional Standard Schema; replaces the flat `input` field so path, query, body, and headers cannot silently merge fields that share a name.
- `ClientArgsOf` and `HandlerArgsOf` — nested `{ params?, query?, body?, headers? }` types for wire-shaped client args and handler-parsed args (`InferInput` / `InferOutput` per source).
- `parseRouteSources(route, { params?, query?, body?, headers? })` — validates each declared source independently; replaces `parseInput`.
- `success?` on `RouteDef` (`200`, `201`, `202`, or `204`; default `200`). `output` is omitted only when success is `204`.
- `HostStatuses` and `HOST_STATUSES` — host defaults `validation_error: 400`, `internal: 500`, `route_not_found: 404`, overridable via `serve(..., { hostStatuses })`.
- `ServeOptions.basePath` and cooperative `serve().handle()` — `matched: false` only outside `basePath` or the contract path set; wrong method on a known path stays `matched: true` with `route_not_found`.
- `toOpenAPI(contract, { info })` on `@eddy-works/never-rest/openapi` — OpenAPI 3.1 from the contract alone; throws `OpenApiExportError` when a validator cannot convert to JSON Schema.
- `createQueryOptions`, `createMutationOptions`, and `isRetryable` on `@eddy-works/never-rest/query` — Result-preserving cache-layer adapters (TanStack Query-shaped, no React/TanStack dependency). `queryFn` / `mutationFn` resolve with `Result` and never reject.
- `createTestClient` on `@eddy-works/never-rest/testing` — typed in-process client through the real `serve` path. `assertProtocolResponse` is re-exported from `./testing` and `./server`.
- `buildRequest` exported from `@eddy-works/never-rest/client`.

### Changed

- `RouteDef.errors` is a code→HTTP-status map (`{ not_found: 404 }`) instead of a string array. Domain statuses live on the contract; host codes stay on `HOST_STATUSES`.
- Client calls name the source: `client.getUser({ params: { id } })`, `client.createUser({ body: { name } })`; routes with no input sources take no args (`client.listUsers()`).
- Handler args are `HandlerArgsOf & { request, context }` — typed `params`, `query`, `body`, and `headers` from schemas instead of a merged `input` plus raw `params`.
- `compileContract` rejects a path with `:param` segments without a `params` schema, `params` on a static path, `body` on GET or DELETE, error statuses outside 400–599, success codes other than 200/201/202/204, `output` on 204 routes, and missing `output` on other success codes. Query is allowed on every method, including POST alongside `body`.
- POST may send query and body together.
- The client treats only `route.success ?? 200` as Ok; any other 2xx is `validation_error` before the body is trusted. `success: 204` resolves `Ok(undefined)` without reading a body.

### Removed

- `RouteDef.input` — use `params?`, `query?`, and `body?`.
- `ClientInputOf`, `HandlerInputOf`, and `InputOf` — use `ClientArgsOf` and `HandlerArgsOf`.
- `parseInput` — use `parseRouteSources`.
- `ServeStatusMap` and `ServeOptions.statuses` — put domain statuses on `RouteDef.errors`.

## [0.4.1] - 2026-08-12

### Added

- `isContractPath` on `@eddy-works/never-rest/contract` — membership check from compiled matchers so shared-process hosts (SvelteKit hooks, Workers) dispatch without hand-copying paths.
- `checkContractOutputs` on `@eddy-works/never-rest/testing` — transport-stability check for every contract output; omitting an operation is a type error.

## [0.4.0] - 2026-08-12

### Added

- `ClientInputOf` and `HandlerInputOf` split wire-shaped client input from handler-parsed input.
- `compileContract`, `assertHandlersComplete`, and `normalizePath` on `@eddy-works/never-rest/contract`.
- `parseOutput` on `@eddy-works/never-rest/contract`.
- `checkTransportStability` on `@eddy-works/never-rest/testing` — test-time helper to prove output schemas survive JSON wire round-trip.
- Gherkin specs for contract compilation and client wire serialization ([specs/contract-compilation.spec.md](specs/contract-compilation.spec.md), [specs/wire-serialization.spec.md](specs/wire-serialization.spec.md)).

### Changed

- `matchPath` returns `PathMatch` (`match` / `miss` / `invalid_encoding`) with safe percent-decoding of captures.
- `compileContract` rejects trailing-slash aliases, duplicate compiled matchers, and duplicate path parameter names within a route.
- Client operations are typed on `ClientInputOf`; client validates raw input and uses precompiled paths from `compileContract`.
- GET/DELETE query arrays serialize as `key[]=`; empty or unrepresentable query values return `validation_error` before fetch.
- Missing or empty path parameters return `validation_error` before fetch on the client.
- Undecodable path captures return `validation_error` on the server; repeated `k[]` query keys deserialize to arrays.
- Handler error codes not declared on the route — including forged `internal` — are normalised at public disclosure; the client no longer copies untrusted remote messages into its own `internal`.
- Ultimate server fail-safe returns a constant JSON body; cycle guards on cause-chain walking.
- Example contracts use `as const satisfies ContractDef`; docs site rewrites `../examples/` to GitHub tree URLs; homepage tagline reflects railway-at-boundary framing.

### Fixed

- Header and body serialization throws on the client become `Err` instead of escaping the railway.
- Unknown remote error codes map to `internal` with a constant message and the remote error preserved as `cause`.
- `request.text()` rejection, disclosure callback throws, and `JSON.stringify` failures on the server are handled without hanging or throwing out of `serve()`.

### Deprecated

- `InputOf` — use `HandlerInputOf` for handlers and `ClientInputOf` for clients.

## [0.3.0] - 2026-08-12

### Changed

- Client operations return `ResultAsync` with `ClientErrorOf` per route — domain codes plus `validation_error`, `internal`, and client-synthesized `unavailable` on network failure; the cast that hid built-in codes is removed.
- `serve` always validates successful handler output through each route's output schema and serialises the **parsed** schema value (strips unknown fields, applies coerces/transforms); handler `Err` results are unchanged.
- Omitted `disclosure` in `serve()` defaults to `public` (`respond` still defaults to `full`).
- Unmatched method or path requests return host code `route_not_found` (not domain `not_found`).
- Handler error codes not declared on the route are normalised to wire `internal` with the original error nested under `cause`.
- `serve` and `createClient` validate the contract at construction via `compileContract`; reserved error codes cannot be domain codes; `ServeOptions.statuses` must satisfy `ServeStatusMap` (every domain code plus `validation_error`, `internal`, and `route_not_found`).

### Removed

- `ServeOptions.validateOutput` — output validation is always on; the 0.2.0 opt-in gate-only behaviour is reversed.

## [0.2.0] - 2026-08-10

### Added

- Advanced usage guide for enterprise policy without middleware — capability types, composer wrappers, host wraps, and agents as amplifiers ([docs/advanced-usage.md](docs/advanced-usage.md)).
- `CHANGELOG.md` ships in the published npm package, following Keep a Changelog with Semantic Versioning.
- Pull requests must update `CHANGELOG.md`; CI fails when the file is untouched. Use consumer-facing categories (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`) for package changes, and `### Internal` for chore, CI, dependency, and refactor work that is dropped at release time.
- Opt-in `ServeOptions.validateOutput` validates successful handler values against each route's output schema before serialising ([#18](https://github.com/project-eddy/never-rest/issues/18)). Validation is a gate only — passing responses are never rewritten to match the schema's coerced value. Failures map to `internal` with detail nested under `cause`.
- `ClientOptions.credentials` forwards a web-standard credential mode (`omit`, `same-origin`, or `include`) on every generated client request ([#17](https://github.com/project-eddy/never-rest/issues/17)).

## [0.1.0] - 2026-08-10

### Added

- `RailError` as plain-data errors, with `railError`, `chain`, `flatten`, and `formatChain` so a cause chain survives JSON serialisation across service boundaries.
- Graded disclosure through `disclose`, redacting an error for `full`, `internal`, or `public` callers rather than obfuscating for everyone.
- Status mapping through `statusFor` and `toDeclaredResponse`, degrading undeclared statuses to 500, plus `respond` to turn a handler `Result` into a status and body.
- `@eddy-works/never-rest/contract`: `RouteDef`, `ContractDef`, `InputOf`, `OutputOf`, `ErrorOf`, `parseInput`, `compilePath`, and `matchPath`. Contracts are plain object literals, validated through any Standard Schema validator.
- `@eddy-works/never-rest/server`: `serve` over the Web-standard `Request` to `Response` interface, with `compileRoutes` and `matchRoute`. Handlers return `Result` and are never expected to throw.
- `@eddy-works/never-rest/client`: `createClient`, giving one composable `ResultAsync` function per contract operation.
- `@eddy-works/never-rest/node`: `toNodeHandler` for Node's `http` interface.
- A published type-instantiation budget of 1,800 per route, enforced in CI with `@ark/attest`.

[Unreleased]: https://github.com/project-eddy/never-rest/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/project-eddy/never-rest/releases/tag/v0.5.0
[0.4.1]: https://github.com/project-eddy/never-rest/releases/tag/v0.4.1
[0.4.0]: https://github.com/project-eddy/never-rest/releases/tag/v0.4.0
[0.3.0]: https://github.com/project-eddy/never-rest/releases/tag/v0.3.0
[0.2.0]: https://github.com/project-eddy/never-rest/releases/tag/v0.2.0
[0.1.0]: https://github.com/project-eddy/never-rest/releases/tag/v0.1.0
