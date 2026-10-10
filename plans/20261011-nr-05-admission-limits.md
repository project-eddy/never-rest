# Plan: NR-05 admission limits

Mission: give hosts a Result-shaped limiter and concurrency gate so a store
failure cannot silently allow unlimited work.

Definition of done:

- `@eddy-works/never-rest/limits` exports `Limiter`, `createMemoryLimiter`,
  `fromRateLimiterFlexible`, and `createConcurrencyGate`.
- Memory limiter has TTL and a hard key cap; new keys at the cap are limited.
- Structural adapter treats `msBeforeNext` as limited and `Error` as store
  failure. `rate-limiter-flexible` is a test-only dev dependency.
- `onStoreFailure` is required: `'reject'` (503) or `{ fallback }`.
- Abort releases waiters and in-flight slots.
- Spec: `specs/admission-limits.spec.md`.

Validation:

```bash
pnpm test src/limits src/server src/local
```

Depends on NR-03 (principal) and NR-04 / NR-06 (boundary codes, signal).

## Wiring

```ts
admission: {
  anonymous?,
  principal?,
  cost?,
  concurrency?,
  onStoreFailure: 'reject' | { fallback: Limiter },
}
```

never-rest does not parse `X-Forwarded-For`. Docs show a trusted-proxy recipe
for building the anonymous key.

## What stays the same

- No distributed limiter ships in the package.
- Memory storage is documented as single-process: resets on restart, no
  replica coordination.
