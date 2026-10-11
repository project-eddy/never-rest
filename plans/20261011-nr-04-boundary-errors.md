# Plan: NR-04 typed boundary errors

Mission: keep 401 / 403 / 408 / 413 / 429 / 503 / 504 intelligible even when a
gateway emits HTML or an empty body, without reserving the domain codes users
already declare.

Definition of done:

- `BOUNDARY_ERRORS` lives in `src/boundary.ts` and is exported from the
  package root.
- `compileContract` rejects domain codes that start with `boundary.`.
- `RailError.retryAfterMs` is public-safe, parsed on the client, and present
  on the public OpenAPI schema.
- `serve` always declares boundary statuses; `Retry-After` is sent in whole
  seconds when `retryAfterMs` is set.
- `mapResponse` classifies by status first, then envelope agreement.
- Spec: `specs/boundary-errors.spec.md`.

Validation:

```bash
pnpm test src/boundary.ts src/client/response.test.ts src/contract/compile.test.ts src/openapi
pnpm openapi:lint
```

## Codes

| Code | Status | Retryable |
| --- | --- | --- |
| `boundary.unauthenticated` | 401 | no |
| `boundary.forbidden` | 403 | no |
| `boundary.request_timeout` | 408 | no |
| `boundary.payload_too_large` | 413 | no |
| `boundary.rate_limited` | 429 | yes |
| `boundary.overloaded` | 503 | yes |
| `boundary.timeout` | 504 | no |
| `boundary.cancelled` | none | no |

## Client mapping

- Valid envelope + matching status → that error.
- Valid envelope + mismatched status → `internal` with remote under `cause`.
- No envelope + 401/403/408/413/429/503/504 → matching boundary error.
- No envelope + 502 → `unavailable`.
- Anything else → `internal`. Raw body is never copied into `message`.
- `Retry-After` parsed as delta-seconds or HTTP-date, clamped to
  `maxRetryAfterMs`.

## OpenAPI

`toOpenAPI(contract, { info, boundary?: { auth?, limits? } })` adds 413/408 on
body routes; shared 401/403/429/503 when flags are on; documents
`Retry-After`. Fixture regenerated; Spectral and oasdiff stay green.

## What stays the same

Domain codes `unauthorized`, `forbidden`, `rate_limited` remain legal.
Reserved host codes stay `validation_error`, `internal`, `unavailable`,
`route_not_found`.
