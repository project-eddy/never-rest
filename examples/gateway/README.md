# Gateway example

Two never-rest services: **inventory** fails with `not_found`, **orders** wraps that
error with `chain`, and the same handler response is rendered at `full`, `internal`,
and `public` disclosure.

```bash
pnpm --filter @eddy-works/never-rest build
pnpm --filter @never-rest-examples/gateway start
```

Expect a two-deep cause chain at `full`, cause dropped at `internal`/`public`, and
`origin` / diagnostic paths absent from `public`.
