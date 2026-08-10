# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Internal

- Bump `@sveltejs/adapter-auto` from 6 to 7 in the SvelteKit example ([#11](https://github.com/project-eddy/never-rest/pull/11)).
- Bump `next` from 15 to 16 in the Next App Router example ([#10](https://github.com/project-eddy/never-rest/pull/10)).
- Bump SvelteKit example tooling to `vite` 8 and `@sveltejs/vite-plugin-svelte` 7 together ([#12](https://github.com/project-eddy/never-rest/pull/12), [#14](https://github.com/project-eddy/never-rest/pull/14)).

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

[Unreleased]: https://github.com/project-eddy/never-rest/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/project-eddy/never-rest/releases/tag/v0.2.0
[0.1.0]: https://github.com/project-eddy/never-rest/releases/tag/v0.1.0
