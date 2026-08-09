# Gateway example

Two never-rest services: **inventory** fails with `not_found`, **orders** wraps that
error with `chain`, and the same handler response is rendered at `full`, `internal`,
and `public` disclosure.

```bash
pnpm build
node --experimental-strip-types examples/gateway/run.ts
```

Expect a two-deep cause chain at `full`, cause dropped at `internal`/`public`, and
`origin` / diagnostic paths absent from `public`.
