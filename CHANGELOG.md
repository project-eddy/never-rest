# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Opt-in `ServeOptions.validateOutput` validates successful handler values against each route's output schema before serialising ([#18](https://github.com/project-eddy/never-rest/issues/18)). Validation is a gate only — passing responses are never rewritten to match the schema's coerced value. Failures map to `internal` with detail nested under `cause`.
- `ClientOptions.credentials` forwards a web-standard credential mode (`omit`, `same-origin`, or `include`) on every generated client request ([#17](https://github.com/project-eddy/never-rest/issues/17)).

### Internal

- Bump `@types/node` from 24 to 26 across the package and examples ([#15](https://github.com/project-eddy/never-rest/pull/15)).
- Bump `@hono/node-server` from 1 to 2 in the Hono example ([#13](https://github.com/project-eddy/never-rest/pull/13)).

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

[Unreleased]: https://github.com/project-eddy/never-rest/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/project-eddy/never-rest/releases/tag/v0.1.0
