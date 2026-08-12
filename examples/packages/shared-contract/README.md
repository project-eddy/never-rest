# Shared contract (Lesson 1)

This package exports **only** the users API contract (plus schemas and the
status map). It does not include handlers or `serve`.

**Protocol win.** The status map is the protocol surface. Domain codes
(`not_found`, `conflict`) sit beside host codes every `serve` needs
(`validation_error`, `internal`, `route_not_found`). `unavailable` is
client-only — the generated client synthesises it on network failure; do
not put it on the server map.

Read [`src/contract.ts`](src/contract.ts).

Then open any framework example. Each one imports `usersContract` and
`statuses`, writes its own handlers, calls `serve(...)`, and mounts the
result on that stack.
