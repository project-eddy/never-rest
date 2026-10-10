# Plan: NR-01 public-safe disclosure

Mission: stop teaching header-forged full disclosure, state what `public`
actually reveals, and default foreign-transport dispatch to `public`.

Definition of done:

- README and `docs/api.md` no longer elevate disclosure from `x-internal`.
- `createDispatcher` defaults to `public`; `createLocalClient` still defaults
  to `full`.
- Docs and `SECURITY.md` say `message` / `issues[].message` are public data;
  the `nextStep` regex is a heuristic, not redaction.
- A regression test proves a forged `x-internal` header cannot raise
  disclosure in shipped examples.
- `specs/graded-disclosure.spec.md` and `specs/local-dispatch.spec.md` cover
  the new contract.

Validation:

```bash
pnpm test src/disclose.test.ts src/local/dispatch.test.ts src/server/serve.test.ts
pnpm examples:conformance
```

## Changes

- Replace header-derived `disclosure` in [README.md](../README.md) and
  [docs/api.md](../docs/api.md) with `disclosure: 'public'` and a pointer to
  principal-derived disclosure.
- Rewrite the per-request disclosure test in `src/server/serve.test.ts` so the
  flag is set by a trusted wrapper, not a request header.
- `createDispatcher` uses `options.disclosure ?? 'public'`.
- `createLocalClient` passes `options.disclosure ?? 'full'` into the
  dispatcher so module-to-module callers keep today's default.
- Update JSDoc on `disclose`, the trust-circles section, and SECURITY.md.

## What stays the same

- `disclose` still keeps `message` and issue messages at `public`.
- `serve` omitted disclosure still defaults to `public`.
- `respond` still defaults to `full`.
