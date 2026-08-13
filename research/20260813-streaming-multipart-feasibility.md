# Streaming and multipart feasibility verdict

**Date:** 2026-08-13  
**Scope:** Slice 08 — written verdict only; no API design, no source changes.  
**Context:** Contract surface 0.5 (`plans/20260813-contract-surface-0.5.md`) keeps `RouteDef.output` JSON-only (optional only when `success: 204`). Other slices are reshaping statuses, OpenAPI export, mount/test, and the query adapter.

## Executive summary

**Recommendation: streaming and multipart are not viable as first-class contract routes within the current railway invariants. They are viable only through a separate, non-railway escape hatch** (for example, a host-mounted handler that never enters `serve`'s JSON pipeline, or a route flag that opts out of `parseOutput` / `mapResponse` with no typed client surface).

Reasoning in one line: the runtime treats HTTP as **buffered JSON text in both directions**, validates **complete in-memory values** before and after the wire, and maps failures to **JSON `RailError` envelopes** with graded disclosure — all of which assume the full body is known before any bytes are committed.

---

## 1. What breaks today

The JSON-text assumption is not incidental; it is threaded through server ingress, handler egress, client egress/ingress, protocol tests, and transport stability checks.

### Server ingress — `readRequestBody`

```169:194:src/server/serve.ts
async function readRequestBody(
  request: Request,
): Promise<Result<unknown, RailError<'validation_error'>>> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return err(
      railError('validation_error', 'Validation failed', {
        issues: [{ path: ['body'], message: 'Could not read request body' }],
      }),
    );
  }
  if (text.length === 0) {
    return ok(undefined);
  }
  try {
    return ok(JSON.parse(text) as unknown);
  } catch {
    return err(
      railError('validation_error', 'Validation failed', {
        issues: [{ path: ['body'], message: 'Invalid JSON body' }],
      }),
    );
  }
}
```

Any non-JSON body (`multipart/form-data`, raw bytes, `text/event-stream` upload) fails at `JSON.parse` or is mis-decoded after `text()`. The body stream is fully consumed as a string before `parseRouteSources` runs (`serve.ts:378–398`).

### Server egress — `jsonResponse` and `parseOutput`

Success responses are always serialised with `JSON.stringify` and `content-type: application/json`:

```240:252:src/server/serve.ts
function jsonResponse(
  status: number,
  body: unknown,
  fallbackStatus: number,
): Response {
  try {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    return failsafeInternalResponse(fallbackStatus);
  }
}
```

Before that, handler output is validated as a complete value:

```162:177:src/contract/parse.ts
export function parseOutput<TRoute extends RouteDef>(
  route: TRoute,
  value: unknown,
): ResultAsync<OutputOf<TRoute>, RailError<'internal'>> {
  return parseSchema(route.output, value).mapErr((failure) =>
    railError('internal', 'An unexpected error occurred', {
      cause: railError(
        'output_validation_failed',
        'Handler output violated the route contract',
        failure.issues.length > 0
          ? { issues: failure.issues }
          : undefined,
      ),
    }),
  ) as ResultAsync<OutputOf<TRoute>, RailError<'internal'>>;
}
```

The `serve` pipeline awaits the handler, then `parseOutput`, then `respond` + `jsonResponse` — there is no branch that returns a `ReadableStream` (`serve.ts:413–451`). Handlers are typed to return `Result<OutputOf<TRoute>, …>` (`serve.ts:23–31`), i.e. a finished value, not a stream handle.

### Client ingress — `mapResponse` and `response.text()`

```183:209:src/client/response.ts
export function mapResponse<TRoute extends RouteDef>(
  route: TRoute,
  response: Response,
): ResultAsync<StandardSchemaV1.InferOutput<TRoute['output']>, ClientErrorOf<TRoute>> {
  return ResultAsync.fromPromise(response.text(), () => unavailableError()).andThen(
    (text) => {
      let parsed: unknown;
      try {
        parsed = text.length > 0 ? JSON.parse(text) : undefined;
      } catch {
        return errAsync(internalError('Response body is not valid JSON'));
      }
      // ...
      if (isSuccess) {
        return validateValue(route.output, parsed);
      }
      // ...
    },
  );
}
```

The typed client always buffers the response body, parses JSON, and validates against `route.output`. Streaming consumers cannot use `createClient` without abandoning this path.

### Client egress — `buildRequest`

```236:246:src/client/request.ts
  const bodyValue = (args as { readonly body?: unknown }).body;
  if (bodyValue !== undefined) {
    if (!mergedHeaders.has('content-type')) {
      mergedHeaders.set('content-type', 'application/json');
    }
    try {
      init.body = JSON.stringify(bodyValue);
    } catch {
      return err(internalError('Request body cannot be serialized'));
    }
  }
```

There is no `FormData`, `Blob`, or stream body path. `specs/wire-serialization.spec.md` codifies JSON-stringified bodies.

### Supporting invariants

| Concern | Location | Implication |
| --- | --- | --- |
| `Result` → HTTP mapping | `respond` (`src/respond.ts:22–40`) | Success and error bodies are plain objects passed to `jsonResponse`. |
| Protocol tests | `assertProtocolResponse` (`src/railway/assert-protocol.ts:31–34`) | Every response must be `application/json` and `JSON.parse`-able. |
| Transport stability | `checkTransportStability` (`src/testing/transport.ts:47–59`) | Schemas must survive `JSON.stringify` round-trip. |
| Node bridge | `toWebRequest` (`src/node/to-node-handler.ts:48–52`) | Incoming Node requests are fully buffered before `serve` sees them. |
| OpenAPI (slice 04) | Plan: `~standard.jsonSchema` on `body` / `output` | Export path assumes JSON Schema for fixed `application/json` media types. |

### After slice 01: `output` stays JSON-only

Slice 01 makes `output` optional only when `success: 204` and requires `output` for all other success statuses (`plans/20260813-contract-surface-0.5.md`, declared `RouteDef`). That reinforces the verdict: **there is no contract slot for a non-JSON success body** in 0.5. Streaming would require a new output kind; multipart uploads would require a new input kind — both are out of scope for the current contract shape.

---

## 2. Streaming responses and `Result` semantics

### How the railway uses `Result` today

1. Handler runs to completion and returns `Result<Output, RailError>` (or `ResultAsync`).
2. On `Ok`, `parseOutput` validates the **entire** value.
3. `respond(ok(value), …)` picks status and body.
4. `jsonResponse` materialises the full body.

The caller's `Result` is resolved **before** any response bytes are sent. The HTTP response is a downstream projection of an already-resolved railway outcome.

### What changes with streaming

If a handler returned (or `serve` forwarded) a `ReadableStream`:

| Phase | Railway assumption | Streaming reality |
| --- | --- | --- |
| Handler return | `Ok` means success payload is known | `Ok` might mean "producer started"; failure can occur later |
| `parseOutput` | Validates full object | Cannot validate an unconsumed stream without buffering (defeating streaming) |
| Error mapping | `respondWithError` → JSON `RailError` | After status/headers sent, errors are truncated responses or connection resets — not JSON envelopes |
| Client `mapResponse` | `response.text()` then parse | Must consume stream incrementally; no single `OutputOf<TRoute>` at resolve time |
| Typed client | `ResultAsync<Output, ClientError>` | Success type would need to be `ReadableStream` or similar — breaks "output schema is wire authority" |

### What a caller could still rely on (if streaming were bolted on)

Under streaming, **only pre-commit invariants** remain trustworthy:

- **Before** the response is returned from `serve`: routing, input validation (`parseRouteSources`), handler `Err` outcomes, and host errors (`validation_error`, `route_not_found`) still map to complete JSON error responses — same as today.
- **After** bytes leave the server: the client can rely on **HTTP status and headers** that were sent, but **not** on a `RailError` body, graded disclosure, or `parseOutput` guarantees for the success payload.
- Mid-stream failures become **transport-level** (`unavailable`, connection error, malformed stream) or **opaque truncation** — not domain `Err` values on the railway.

`Result` semantics can be preserved **only** if "success" is defined as "handler returned `Ok` and the stream was *handed off*" — not "the stream completed successfully." That is a weaker guarantee than every other route today and would need explicit documentation if ever offered.

### Verdict on streaming

Streaming responses **cannot** stay inside the current `Result` / output-validation / JSON-protocol invariants without redefining what `Ok` means. They fit **only** as an escape hatch outside the typed client and outside `parseOutput` / `assertProtocolResponse`.

---

## 3. Multipart request bodies

### Wire path

Multipart uploads require `request.formData()` (or manual `multipart/*` parsing), not `request.text()` + `JSON.parse`. Fields and files arrive as `FormData` entries; file parts are `File` or `Blob` depending on runtime.

### Standard Schema and the `File` / `Blob` boundary

`parseRouteSources` passes `raw.body` into `parseSchema` (`src/contract/parse.ts:140–146`). Standard Schema validators expect a JavaScript value:

- **Browser / Workers:** `File` is available; Zod-style `z.instanceof(File)` can validate in handler args.
- **Node (via `toNodeHandler`):** `File` exists in modern Node, but uploaded files are often represented as buffers or streams unless the host populates web `File` objects.
- **JSON Schema export (slice 04):** `File` / `Blob` do not have a portable `~standard.jsonSchema` representation. OpenAPI would need `multipart/form-data` with `type: string, format: binary` per field — a parallel schema path, not the current JSON body projection.
- **Symmetric client:** `buildRequest` cannot send multipart from typed `args.body` without a new serialisation branch. Browser `FormData` construction from inferred input types is non-trivial (field names, file vs text parts, ordering).
- **Transport stability:** `checkTransportStability` explicitly JSON-round-trips values (`src/testing/transport.ts:57–59`). `File` / `Blob` are not JSON-serialisable; they would be excluded from stability checks or would always fail.

### Content-Type negotiation

Today there is no per-route `consumes` or content-type field on `RouteDef`. The server does not inspect `Content-Type` before calling `readRequestBody`. Adding multipart requires either:

- a contract declaration of allowed media types (new surface), or
- heuristic branching in `readRequestBody` (fragile, untyped).

### Verdict on multipart

Server-side multipart parsing is **technically possible** but **not compatible** with the current invariants as a normal contract route: symmetric client encoding, Standard JSON Schema export, `parseRouteSources` symmetry, and JSON transport stability all break.

A **constrained** design (server-only upload route, no `createClient` support, hand-written `FormData` on the caller, OpenAPI documents `multipart/form-data` separately) is conceivable but is still a **second-class** wire shape — closer to an escape hatch than to "multipart in the railway."

---

## 4. Graded disclosure and mid-stream errors

`disclose` redacts `RailError` fields before they become the response body (`src/disclose.ts:59–90`). It operates on a **complete error object** immediately before `jsonResponse` serialises it.

If an error arises **after** response headers (and especially after body bytes) are sent:

- **Cannot retroactively redact** bytes already on the wire. A `cause` chain, stack fragment, or internal field leaked in an early chunk stays leaked.
- **Cannot replace** the body with a disclosed `RailError` JSON envelope. HTTP has no "undo" for a half-sent `200` with `content-type: application/json`.
- **Public disclosure policy** (`serve` defaults to `public` via `resolveDisclosure`, `serve.ts:219–230`) assumes errors are composed **before** commit. Mid-stream failures bypass `respondWithError` entirely.

Streaming therefore **weakens graded disclosure guarantees** in exactly the scenario where partial output is most dangerous (long-running, large, or sensitive payloads). This is independent of whether the handler used `Result` correctly at start time.

---

## 5. Options compared

### Option A — Not viable within current invariants (status quo)

Keep streaming and multipart **out of the contract and out of `serve`**. Document that all contract routes are JSON buffered end-to-end. Aligns with `docs/comparison.md` and `research/20260812-rest-contract-library-expectations.md`.

| Function / module | Change |
| --- | --- |
| *(none)* | No code changes |

**Pros:** Zero risk to protocol honesty, OpenAPI truthfulness, typed client, disclosure, conformance.  
**Cons:** Adopters needing SSE, NDJSON, file upload, or large download streams mount separate handlers.

---

### Option B — Viable with named constraints (first-class, limited)

Extend the contract and runtime for **specific** non-JSON shapes under strict rules, for example:

- **Streaming:** only `GET`; no `output` schema (or `output` describes chunk schema, not wire validation); client returns `ReadableStream` not `OutputOf`; errors after header commit are transport failures.
- **Multipart:** only `POST`/`PUT`/`PATCH`; `body` schema uses `File` fields; server-only or manual client; OpenAPI emits `multipart/form-data`; skip `checkTransportStability` for those routes.

| Function / module | Change |
| --- | --- |
| `readRequestBody` (`serve.ts:169–194`) | Branch on `Content-Type`; `formData()` path for multipart |
| `parseRouteSources` / `parseSchema` (`parse.ts:89–158`) | Accept `FormData` or pre-parsed parts; map file fields |
| `buildRequest` (`request.ts:236–246`) | Optional `FormData` serialisation from typed body |
| `parseOutput` (`parse.ts:162–177`) | Skip or replace for stream routes; optional post-hoc validation |
| `jsonResponse` (`serve.ts:240–252`) | Stream branch: `new Response(stream, { headers })` without stringify |
| `serve` handler pipeline (`serve.ts:413–451`) | New branches before/after `parseOutput` |
| `mapResponse` (`response.ts:183–209`) | Stream branch; no `response.text()` for those routes |
| `respond` (`respond.ts:22–40`) | Bypass for raw `Response` returns |
| `Handler` type (`serve.ts:23–31`) | Widen return type for stream routes |
| `RouteDef` / `compileContract` (slice 01 types) | `consumes`, `produces`, or media-type flags |
| `toOpenAPI` (slice 04) | `multipart/form-data`, `application/octet-stream`, etc. |
| `assertProtocolResponse` (`assert-protocol.ts:31–34`) | Exempt or alternate assertions for non-JSON routes |
| `checkTransportStability` (`transport.ts:47–59`) | Exclude non-JSON schemas |
| `createClient` / `callRoute` (`create.ts:78–104`) | Per-route client behaviour split |
| `toWebRequest` (`to-node-handler.ts:48–52`) | Streaming upload may need size limits / streaming parse |

**Pros:** Could appear in OpenAPI and partial typing.  
**Cons:** Large surface area; weakens "protocol cannot lie" unless constraints are harsh; `Result` meaning diverges by route; high test and type-budget cost. Conflicts with 0.5 plan to keep `output` JSON-only.

---

### Option C — Separate non-railway escape hatch (recommended)

Contract routes remain JSON buffered. Hosts that need streams or multipart:

- Mount a **non-contract** `fetch` handler (alongside `serve().handle()` cooperative mount from slice 02), or
- Add an explicit **opt-out** route kind (e.g. `raw: true`) where the handler receives `Request` and returns `Response` directly — **no** `parseOutput`, **no** `mapResponse`, **no** `createClient` method, **no** OpenAPI operation (or OpenAPI documents it as an opaque passthrough with a warning).

| Function / module | Change |
| --- | --- |
| `serve` / `ServeHandler.handle` (slice 02) | Document or route unmatched paths to host handler (mount already planned) |
| `compileContract` | Optionally reject or mark non-exportable raw routes |
| `toOpenAPI` | Skip or stub raw routes |
| *(optional)* `RouteDef` flag | Declares "not on railway" for documentation only |
| **Unchanged** | `readRequestBody`, `jsonResponse`, `parseOutput`, `mapResponse`, `buildRequest`, `respond`, `disclose`, `assertProtocolResponse` for contract routes |

**Pros:** Preserves invariants for 99% of routes; matches existing "Not in scope" positioning; minimal type and conformance risk; graded disclosure stays meaningful on the railway.  
**Cons:** No typed client for escape routes; adopters write manual `fetch` / `FormData`; two speeds of API in one app.

---

## 6. Recommendation

**Adopt Option C: keep streaming and multipart off the railway; allow them only via a separate host-level escape hatch.**

Reasoning:

1. **Protocol honesty** — `parseOutput`, `mapResponse`, and `assertProtocolResponse` exist so the wire cannot diverge from the contract. Streaming and multipart either buffer (negating the feature) or skip validation (lying by omission).
2. **`Result` integrity** — The library's differentiator is composable `Result` / `ResultAsync` at every boundary. Streaming success before completion is a different semantic; mixing it into `OutputOf<TRoute>` would confuse every consumer including slice 06's query adapter.
3. **Graded disclosure** — Mid-stream errors cannot be disclosed retroactively; keeping streams off the railway avoids implying disclosure covers partial bodies.
4. **0.5 contract shape** — JSON-only `output` (except 204) and JSON Schema OpenAPI export are explicit decisions. First-class streaming/multipart would reopen contract-shape and perf-budget work without adopter evidence (`research/20260812-rest-contract-library-expectations.md`).
5. **Practical path** — Slice 02's cooperative `handle()` mount already lets hosts serve non-contract paths. File uploads and SSE fit there, or behind a dedicated CDN/storage URL returned from a normal JSON contract route.

**Do not pursue Option B** until there is concrete adopter evidence that escape hatches are insufficient *and* acceptance of weaker guarantees (no typed client, no output validation on the wire, transport-level failure after commit).

**Confirm Option A for 0.5:** no API, no types, no packages — this document is the deliverable.

---

## Done

Feasibility verdict written at `research/20260813-streaming-multipart-feasibility.md`. No source files modified.

## Acceptance results

| Check | Result |
| --- | --- |
| Names exact functions each option would change | Yes — tables in §5 list `readRequestBody`, `jsonResponse`, `parseOutput`, `mapResponse` (`response.text()`), `buildRequest`, `respond`, `disclose` (interaction), plus mount/OpenAPI/client/test helpers per option |
| Assesses streaming vs `Result` semantics | Yes — §2; caller can rely on pre-commit errors only |
| Assesses multipart vs Standard Schema / `File`/`Blob` | Yes — §3 |
| States graded disclosure / mid-stream interaction | Yes — §4 |
| Recommends one option with reasoning | Yes — Option C, §6 |
| No source file modified | Yes |

## Requests

- **Slice 02 / docs (lead):** In mount and migration docs, state explicitly that cooperative `handle()` / `basePath` is the supported place for non-JSON handlers (SSE, file upload, raw proxy) — no railway types.
- **Slice 04:** Confirm `toOpenAPI` skips or documents non-contract mount routes; no `multipart/form-data` generation in 0.5.
- **Slice 07:** Keep `docs/comparison.md` "Not in scope" list including streaming and multipart; point to this research note.

## Deviations

None.
