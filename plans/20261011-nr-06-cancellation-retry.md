# Plan: NR-06 cancellation and retry

Mission: propagate abort where the platform supports it, stop treating
`internal` as automatically retryable, and make write replay an explicit
caller choice.

Definition of done:

- Handlers receive `signal`. `serve` combines `request.signal` with optional
  `timeouts: { defaultMs?, operations? }`. Deadline → `boundary.timeout`.
- `dispatch(operation, args, { context, principal, signal })`. Local client
  methods take `(args, { signal, principal })`. Abort → `boundary.cancelled`.
- Client call options `{ signal, idempotencyKey }`; `ClientOptions.timeoutMs`
  sets a default. `Idempotency-Key` is forwarded.
- `isRetryable` is true only for `retryable: true`, `unavailable`,
  `boundary.rate_limited`, and `boundary.overloaded`.
- `withRetry(call, { idempotent, attempts, baseMs, capMs, signal })` in
  `./client`: `idempotent` required; default 3 attempts, max 10; exponential
  backoff with full jitter; honours `retryAfterMs` up to `capMs`; stops on
  abort.
- `examples/cancellation` runs CPU work in `worker_threads` and terminates
  the worker on abort; conformance asserts the slot is released.
- Spec: `specs/cancellation-retry.spec.md`.

Validation:

```bash
pnpm test src/client src/query src/local src/server
pnpm examples:conformance
```

Depends on NR-04.

## What stays the same

- Domain `retryable` on a declared error still means what the route author
  said.
- Writes are never retried unless the caller passes `idempotent: true`.
