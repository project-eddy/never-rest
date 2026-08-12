---
title: Concepts
description: Railway at the HTTP boundary, no middleware via andThen, errors as data, and graded disclosure.
---

# Concepts

## Railway at the boundary

A **railway** is a success/failure track: operations stay on `Ok` until something fails, then the chain moves to `Err` and stays there. never-rest puts the railway at the HTTP boundary.

Handlers return `Result` or `ResultAsync` — never throw for expected failures (`not_found`, `validation_error`, domain codes). `createClient` returns `ResultAsync` for every operation; network failures, parse failures, and declared error responses become `Err(RailError)` so callers use `map`, `mapErr`, `andThen`, and `match` without `try/catch` at each hop.

`parseInput` follows this rule: validation failures are `Err(validation_error)`, never throws. Thrown validators are caught and mapped to `Err`.

`serve` catches thrown exceptions inside a handler and converts them to a 500 `RailError` (original message under `cause` for internal disclosure). Public disclosure does not leak a stack trace.

## No middleware — the chain is the middleware

Middleware exists in ts-rest, oRPC, and tRPC because handlers throw and something has to intercept. When handlers return `Result`, that job disappears. Auth, permission checks, rate limiting, and logging are ordinary functions on the railway — `andThen` before or after the domain work. The library carries no interceptor API because the language already has one.

What used to be a separate middleware stack becomes a short pipeline you can read top to bottom. An auth check runs *before* the request is processed the same way a promise chain runs its first link first — except failure is typed data, not a thrown exception recovered somewhere else:

```ts
import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import { railError, type RailError } from '@eddy-works/never-rest';

type Session = { userId: string; roles: readonly string[] };

function requireAuth(request: Request): ResultAsync<Session, RailError<'unauthorized'>> {
  const header = request.headers.get('authorization');
  if (header === null) {
    return errAsync(railError('unauthorized', 'Missing credentials'));
  }
  return loadSession(header); // ResultAsync<Session, RailError<'unauthorized'>>
}

function requireRole(
  session: Session,
  role: string,
): ResultAsync<Session, RailError<'forbidden'>> {
  if (!session.roles.includes(role)) {
    return errAsync(railError('forbidden', `Requires role ${role}`));
  }
  return okAsync(session);
}

// Handler body — contextual gates, then the work. No middleware registry.
getInvoice: ({ input, request }) =>
  requireAuth(request)
    .andThen((session) => requireRole(session, 'billing'))
    .andThen((session) => loadInvoiceFor(session.userId, input.id)),
```

If `requireAuth` fails, `requireRole` and `loadInvoiceFor` never run. The `Err` travels the same path a successful value would have — out through `respond` / `serve` — with the declared code (`unauthorized`, `forbidden`) mapped by your `StatusMap`. That is the whole trick: contextual permission work is just programming on the railway, not a framework feature you bolt on around throws.

It feels like flow-based composition — steps named, ordered, and short-circuiting — without leaving ordinary TypeScript functions. Same pattern on the client: `client.getUser(id).andThen(loadOrders).map(toSummary)`.

Gates are only one slot. The full pattern catalogue — router, tee, through, recover, fan-out, accumulate, lift, terminate, bubble, disclose, retry, and a white-label tenant provisioning kitchen sink — lives in [railway-patterns.md](./railway-patterns.md), with links to neverthrow and Scott Wlaschin’s ROP.

For enterprise policy that must be non-omittable — capability types, `withAuth` composers, public escape hatches, host wraps, and agents as amplifiers — see [advanced-usage.md](./advanced-usage.md).

## Errors as data

`RailError` is plain serialisable data: `code`, `message`, optional `issues`, optional `cause`, optional `origin`, `retryable`, and `nextStep`. It survives `JSON.parse(JSON.stringify(error))`, which is what makes cross-service bubbling work.

Validation issues from any Standard Schema validator map onto `RailIssue` (`path`, `message`). The library does not own error codes for validators — it owns `RailError` above them.

HTTP status is not embedded in the error. Consumers supply a `StatusMap` and `statusFor` / `toDeclaredResponse` / `respond` map codes to declared statuses. An error whose code is missing from the map, or whose mapped status is not declared on the route, degrades to **500** rather than leaking an undeclared response shape.

## Trust circles and graded disclosure

**Transparency by default inside the trust circle.** Agents and internal services need causal chains, field paths, and actionable hints to recover without guessing. Blanket obfuscation — hiding everything behind a generic message — forces callers to open tickets, replay traffic, or hallucinate fixes.

**Graded disclosure** applies at the edge: the same handler result can be rendered at `full`, `internal`, or `public` depending on who is calling.

| Level | Intended caller | What stays | What drops |
| --- | --- | --- | --- |
| `full` | Same trust circle (gateway ↔ service, internal agent) | Everything including `cause` chain and `nextStep` | — |
| `internal` | Staff tools, support consoles | `code`, `message`, `issues`, `nextStep` | `cause` chain |
| `public` | Internet clients, untrusted agents | Safe `code` and message; advisory `nextStep` only | `cause`, `origin`, diagnostic `issues` paths |

`disclose(error, level)` is the mechanism, used by `respond` and `serve`. oRPC documents the same problem as repeated DANGER callouts about sensitive data in error payloads; never-rest encodes the policy in one function. `serve` resolves `disclosure` per incoming `Request` when a function is supplied in `ServeOptions`; when `disclosure` is omitted, `serve` defaults to `public`. `respond` still defaults to `full`.

Route matching uses `compileRoutes` / `matchRoute` (via `./server`), built on `compilePath` / `matchPath`: exact segments and single `:param` placeholders, declaration order. Unmatched method or path → host code `route_not_found` (not domain `not_found`).

Successful handler output is always validated and serialised through the route's output schema — the parsed value reaches the wire, not the handler's raw return value. See [api.md — serve](./api.md#serve).

`origin` stamps which service produced each hop so a gateway can show a chain without guessing order. See [errors-as-intelligence.md](./errors-as-intelligence.md) and [api.md — disclose](./api.md#disclose).
