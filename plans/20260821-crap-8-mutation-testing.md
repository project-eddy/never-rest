# Plan: CRAP 8 and mutation testing

Mission: make never-rest’s test suite semantically stable, with every production function at CRAP ≤ 8 and a mutation score gated in CI.

See `research/20260821-crap-and-mutation-testing.md` for sources and the measured baseline.

## Validation

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm crap --fail-on 8 \
  && pnpm perf:check && pnpm build
```

Plus `pnpm test:mutate` after the mutation break threshold is set.
