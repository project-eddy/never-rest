# Shared contract (Lesson 1)

This package exports **only** the users API contract (plus schemas and the
status map). It does not include handlers or `serve`.

Read [`src/contract.ts`](src/contract.ts).

Then open any framework example. Each one imports `usersContract` and
`statuses`, writes its own handlers, calls `serve(...)`, and mounts the
result on that stack.
