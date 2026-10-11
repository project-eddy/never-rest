# Plan: NR-03 operation policy

Mission: make authorization a construction-time registration that covers every
operation, driven by a verified principal — not a header-forged trust flag.

Definition of done:

- `@eddy-works/never-rest/policy` exports `definePolicy`.
- Missing, unknown, or malformed operation entries throw
  `ContractConfigurationError` at construction.
- When `policy` is present, HTTP verifies from headers before the body is
  read; local callers supply the principal; a non-public operation without one
  returns `boundary.unauthenticated`.
- Verifier throw → 401; authorizer throw → 403. Failures deny.
- Passing both `policy` and `disclosure` throws.
- `docs/advanced-usage.md` is rewritten around `definePolicy`; stale
  `TRoute['errors'][number]` and `as never` examples are gone.
- Spec: `specs/operation-policy.spec.md`.

Validation:

```bash
pnpm test src/policy src/server/serve.test.ts src/local/dispatch.test.ts
pnpm examples:typecheck
```

Depends on NR-01 (disclosure contract) and NR-04 (boundary codes).

## API

```ts
const policy = definePolicy(contract, {
  verify: (request) => verifyBearer(request),
  operations: {
    getDoc: ({ principal, args }) => canRead(principal, args.params.id),
    health: 'public',
  },
  disclosure: (principal) =>
    principal?.role === 'operator' ? 'internal' : 'public',
});
```

`policy` is optional on `serve` and `createDispatcher`. When present it covers
every operation and neither path can skip it.

## What stays the same

- Composers remain the tool for mid-chain commercial gates.
- No interceptor stack. Policy is a map checked at construction, then ordinary
  functions on the railway.
