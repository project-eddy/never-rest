# What developers expect from a REST contract library

## Verdict

Developers now treat OpenAPI export, status-aware responses, reliable mounting, and in-process testing as normal contract-library capabilities. never-rest should adopt the parts that strengthen its existing promise without becoming another framework ecosystem:

1. Finish the protocol-honesty work already planned.
2. Validate demand before choosing between mount/test primitives and OpenAPI as the next major slice.
3. Build both as small, fetch-native projections of runtime truth.
4. Add route request headers and success-status variants only after those foundations.
5. Keep middleware stacks, framework packages, UI-query wrappers, streaming, and multipart out of the core unless adoption evidence changes.

The strongest differentiation is not feature breadth. It is the combination of `Result`/`ResultAsync` boundaries, graded disclosure and cause chains, fail-closed contract compilation, and a measured TypeScript type-performance budget.

## What the waves found

### Baseline expectations

- First-party contract-to-OpenAPI export is common across ts-rest, Zodios, oRPC, and tsoa.
- Competitors commonly expose per-status response schemas, route headers, multiple body formats, middleware/interceptors, framework adapters, and UI data-fetching integrations.
- Fetch-native libraries still need a cooperative mount seam and a typed in-process test path.
- Cancellation through Fetch semantics, clear package metadata, current examples, and visible release artefacts are low-cost adoption signals.

### Current strengths

- Contract compilation, input/output validation, and `RailError` disclosure make the wire boundary unusually explicit.
- Standard Schema support avoids a Zod-only contract DSL.
- The type-instantiation performance gate is a credible differentiator.
- Subpath exports, `sideEffects: false`, documentation, migration notes, examples, and package conformance checks are already strong for a 0.x library.

### Highest-value improvements

#### 1. Complete protocol honesty

Land and stabilise separate `params`, `query`, and `body` sources, symmetric wire serialisation, fail-closed route compilation, output validation, and trust-boundary normalisation. OpenAPI and integration helpers must project this behaviour rather than introduce parallel semantics.

#### 2. Fetch-native mount and test primitives

A minimal design is:

- `basePath` support in server options;
- retain `serve()` as the exclusive, always-responding API;
- add a cooperative handler returning `{ matched, response }` without treating method misses on known paths as fallthrough;
- add `createTestClient()` by injecting an in-process `fetch` that traverses the real server path.

This removes hand-written prefix stripping and pre-gating while preserving `route_not_found` guarantees. Expand conformance beyond Express and Hono to Next, SvelteKit, and Workers.

#### 3. Honest OpenAPI 3.1 export

Add an `./openapi` entry point with a small projection such as `toOpenAPI(contract, { info, statuses })`. It should:

- compile the contract first;
- require the external `ServeStatusMap` rather than invent statuses;
- derive input and output JSON Schema through Standard JSON Schema and fail when conversion is unavailable;
- document the actual bracket-array query encoding;
- emit public error shapes by default;
- use fixed JSON media types and the runtime's actual success status;
- initially omit auth, examples, callbacks, webhooks, imports, generated clients, and documentation UIs.

Generated fixtures should be linted with Spectral and checked for breaking changes with oasdiff.

#### 4. Selective wire parity

After the first two adoption capabilities, consider:

- contract-level request headers;
- success-status variants such as 201 and 204;
- structured client-side validation issues;
- clearer async-validation and transport-stability tests;
- package metadata, GitHub Releases, and conformance status.

Each contract-shape addition should be measured against the existing type-performance budget.

## Options considered

The operator selected:

- focused core with selective parity over broad competitor parity;
- first-party OpenAPI export over leaving it to plugins;
- fetch-native primitives over framework adapters or UI wrappers.

There is not yet evidence that mounting friction or missing OpenAPI is the next adopter's larger blocker. The next action should therefore be a short evidence-gathering step: interview or observe several plausible adopters, then order those two slices. If evidence remains unavailable, mount/test primitives are the safer first implementation because they are smaller, exercise runtime truth directly, and reduce maintenance in existing examples.

## Risks and open questions

- An exporter can lie if statuses, schema conversion, disclosure level, or query encoding are inferred loosely.
- Cooperative mounting can weaken protocol guarantees if unknown methods or malformed known paths fall through.
- Status-specific success bodies and headers can increase type complexity beyond the project's budget.
- Validator support for Standard JSON Schema may vary; silent fallback to `{}` would be worse than no export.
- Framework adapters and UI wrappers could create a maintenance surface that obscures the library's differentiated core.
- Real adopter evidence is still needed to order mounting/testing against OpenAPI.

## Sources

### never-rest

- `README.md`
- `CHANGELOG.md`
- `docs/comparison.md`
- `docs/concepts.md`
- `docs/performance.md`
- `src/contract/types.ts`
- `src/contract/compile.ts`
- `src/server/serve.ts`
- `src/server/types.ts`
- `src/client/request.ts`
- `src/testing/transport.ts`
- `specs/contract-compilation.spec.md`
- `specs/input-sources.spec.md`
- `specs/status-mapping.spec.md`
- `specs/wire-serialization.spec.md`
- `plans/20260812-protocol-cannot-lie-0.4.md`

### Primary external sources

- OpenAPI Specification 3.1: https://spec.openapis.org/oas/v3.1.0
- Standard JSON Schema: https://standardschema.dev/json-schema
- ts-rest documentation: https://ts-rest.com/docs
- Zodios documentation: https://www.zodios.org/docs/intro
- oRPC documentation: https://orpc.dev/docs
- Hono RPC and testing: https://hono.dev/docs/guides/rpc and https://hono.dev/docs/helpers/testing
- tsoa documentation: https://tsoa-community.github.io/docs/
- Spectral: https://github.com/stoplightio/spectral
- oasdiff: https://github.com/oasdiff/oasdiff
- OpenAPI Generator: https://github.com/OpenAPITools/openapi-generator
- HTTP Semantics, RFC 9110: https://www.rfc-editor.org/rfc/rfc9110
- HTTP Caching, RFC 9111: https://www.rfc-editor.org/rfc/rfc9111
- OWASP API Security: https://owasp.org/API-Security/
