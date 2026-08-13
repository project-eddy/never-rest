# Files and streams example (Lesson 5)

## What you will learn

JSON routes stay on `serve`. Multipart uploads and SSE live on sibling host
handlers. A shadow `RouteDef` (never passed to `serve` or `createClient`)
validates JSON-shaped form fields via `parseRouteSources`; the `File` never
enters the contract.

Guide: [docs/files-and-streams.md](../../docs/files-and-streams.md).

## Read in this order

1. [`src/contract.ts`](src/contract.ts) — served JSON contract (`/assets`, `/jobs`)
2. [`src/shapes.ts`](src/shapes.ts) — shadow `uploadMeta` and `eventSchema`
3. [`src/host.ts`](src/host.ts) — multipart + SSE; `jsonFromResult` is example-local
4. [`src/dispatch.ts`](src/dispatch.ts) — host paths first, then `api.handle()`
5. [`src/run.ts`](src/run.ts) — in-process demo

There is no HTTP server. The script runs `dispatch` in-process and prints to
the terminal.

## Protocol win

`createClient` only sees JSON operations. `/uploads` is `handle()` unmatched.
Pre-commit failures (missing title, unknown job) are JSON `RailError`
envelopes. After SSE headers, failure is transport — not a disclosed body.

## Run

```bash
pnpm --filter @eddy-works/never-rest build
pnpm --filter @never-rest-examples/files-and-streams start
```
