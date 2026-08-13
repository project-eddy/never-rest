---
title: Files and streams
description: JSON stays on the railway. Multipart and SSE are host plumbing that reuse parse helpers until bytes commit.
---

# Files and streams

Contract routes are buffered JSON. `Ok` means the success payload is known and has been checked. Multipart bodies and streaming responses are host plumbing. They do not get a `RouteDef` flag, a `createClient` method, or an OpenAPI media type.

Put **metadata and policy** on the railway. Put **bytes** off it. Do not put the byte path on the `ContractDef` you pass to `serve` — `handle()` will treat it as a JSON route and steal the request.

Runnable proof: [`examples/files-and-streams`](../examples/files-and-streams). Why the railway cannot own streams: [research note](../research/20260813-streaming-multipart-feasibility.md). First-class streaming still belongs to [oRPC](./comparison.md#orpc).

## Ticket / signed URL

Prefer this. The contract *is* the API; bytes never enter the process.

1. `POST /uploads` (served) → `Ok({ uploadUrl, uploadId })` after gates.
2. The client `PUT`s the file to the signed URL (S3, R2, a CDN).
3. `POST /uploads/:id/complete` (served) with a JSON body (`checksum`, `size`) → domain `Result`.

The typed client and `toOpenAPI` stay honest. Same split for downloads: `Ok({ url })`, then the CDN streams.

## Sibling handler

Use this when bytes must hit *this* process. The path is **not** on the served contract. Host code runs first; `handle()` never sees the request.

[`examples/files-and-streams/src/dispatch.ts`](../examples/files-and-streams/src/dispatch.ts) does:

1. `POST /uploads` → `handleUpload`
2. `GET /jobs/:id/events` → `handleEvents`
3. otherwise `api.handle()`; unmatched → 404

A **shadow** `RouteDef` in [`src/shapes.ts`](../examples/files-and-streams/src/shapes.ts) (`uploadMeta`) is never passed to `serve` or `createClient`. The host reconstructs JSON-shaped fields from `FormData`, then calls `parseRouteSources`. The `File` stays host-side. Pre-commit `Err` goes through `respond` (example-local `jsonFromResult` in [`src/host.ts`](../examples/files-and-streams/src/host.ts) — not a package export). Success JSON goes through `parseOutput` so it matches served `GET /assets/:id`.

```ts
const meta = await parseRouteSources(uploadMeta, {
  body: { title: String(form.get('title') ?? '') },
});
if (meta.isErr()) {
  return jsonFromResult(err(meta.error), uploadMeta);
}
const file = form.get('file'); // File — not in the schema
```

## SSE

Railway until headers. After `text/event-stream` is committed, failure is transport — `disclose` cannot redact a partial body.

[`handleEvents`](../examples/files-and-streams/src/host.ts) gates with `parseRouteSources(jobEventsGate, { params })`. Unknown job → JSON `not_found` **before** the stream. Each event goes through `parseSchema(eventSchema, payload)`, not `RouteDef.output`. `output` means the HTTP success body of a contract route.

## Anti-patterns

- Putting `/uploads` or `/jobs/:id/events` on the served contract so `handle()` matches them as JSON.
- Omitting `body` on a served route and calling `request.formData()` in the handler. Egress stays on the railway; OpenAPI and `createClient` lie.
- Using `route.output` as an SSE event schema.
- Expecting `toOpenAPI` or `createClient` to describe sibling paths. Document those operations by hand if you must.

## Node / Express

[`toNodeHandler`](./api.md#tonodehandler) buffers POST/PUT/PATCH/DELETE into a `Uint8Array` before your fetch handler runs (`toWebRequest`). Register upload routes on Express **before** that bridge if you need the live body stream. SSE and downloads can still pipe out — `writeWebResponse` uses `Readable.fromWeb`.

Fetch-native hosts (Workers, SvelteKit, Hono, Next) keep the request stream on unmatched paths. Cooperative [`handle()`](./api.md#servehandler) is the seam; a prefix heuristic is not.
