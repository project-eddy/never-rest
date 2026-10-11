# Plan: NR-02 bounded ingress

Mission: enforce byte and time limits at the layer that actually reads bytes,
and stop the Node bridge from buffering unknown-route bodies.

Definition of done:

- `ServeOptions.limits` defaults to 1 MiB and 30 s.
- `content-length` over the limit is rejected before any body bytes are read.
- Chunked and understated-length bodies are bounded; slow reads time out.
- `toNodeHandler` streams through a counting transform, maps close to
  `Request.signal`, and drains leftover bodies.
- `handle()` sibling handlers still receive a stream.
- Spec: `specs/bounded-ingress.spec.md`.

Validation:

```bash
pnpm test src/server src/node
```

Depends on NR-04 (`boundary.payload_too_large`, `boundary.request_timeout`).

## Changes

- Replace `readRequestBody` with a streaming reader that counts bytes, cancels
  the reader past the limit (413), and races a deadline (408).
- Body is read only after route match (and principal verification once NR-03
  lands).
- `toNodeHandler(handler, { maxBodyBytes, bodyTimeoutMs })` drops
  `buffer(req)`, uses `Readable.toWeb` + `duplex: 'half'`, rejects oversized
  `content-length` before the fetch handler, and forwards `req`/`res` close
  onto `AbortSignal`.
- Rewrite the buffering caveat in `docs/files-and-streams.md`. Document
  deployment-owned limits (Node `requestTimeout`, `headersTimeout`,
  `maxHeaderSize`, proxy limits) and hosts that parse first.

## What stays the same

- GET/DELETE still do not read a body.
- Cooperative `handle()` still falls through outside the contract path set.
- Ticket-URL and sibling-handler recipes stay the files-and-streams story.
