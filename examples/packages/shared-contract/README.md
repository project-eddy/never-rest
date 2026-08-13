# Shared contract (Lesson 1)

This package exports **only** the users API contract (plus schemas). It does not
include handlers or `serve`.

**Protocol win.** Domain error codes and their HTTP statuses live on each
`RouteDef.errors` entry (`{ not_found: 404 }`, `{}` when none). Host codes
(`validation_error`, `internal`, `route_not_found`) are `serve` defaults.
`unavailable` is client-only — the generated client synthesises it on network
failure.

Read [`src/contract.ts`](src/contract.ts).

Then open any framework example. Each one imports `usersContract`, writes its
own handlers, calls `serve(...)`, and mounts the result on that stack.
