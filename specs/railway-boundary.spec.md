---
title: Railway at the protocol boundary
domain: server
status: draft
---

> **Job story:** When a handler is a neverthrow railway, I want the HTTP protocol
> to keep its fail-closed invariants so combinators cannot put reserved codes or
> unserialisable values on the public wire.

# Railway at the protocol boundary

`serve` accepts `Result`, `ResultAsync`, or `Promise<Result>`. Combinators that
reshape the Err track, throw inside tees, or recover to a bad Ok must still
produce a JSON response whose wire code is either a declared domain code or a
host reserved code. At default `public` disclosure the top-level message never
leaks handler-supplied reserved-code text.

## Cooperative handle mount

```gherkin
Scenario: Declining paths outside basePath
  Given serve with basePath /api
  When handle is called for a path outside /api
  Then matched is false

Scenario: Declining paths outside the contract
  Given serve without basePath
  When handle is called for a path that matches no contract route pattern
  Then matched is false

Scenario: Answering wrong method on a known contract path
  Given a GET route on /users/:id
  When handle is called with DELETE on /users/u1
  Then matched is true
  And the response status is the declared route_not_found status
  And the body code is route_not_found
```

## Gate short-circuits before domain work

```gherkin
Scenario: Short-circuiting a gate on the Err track
  Given a GET route with declared error unauthorized
  And a handler that gates with andThen then loads a user
  And the gate returns Err unauthorized
  When the route is invoked
  Then the response status is the mapped unauthorized status
  And the body code is unauthorized
  And the load step did not run
```

## Translate mapErr onto a declared domain code

```gherkin
Scenario: Translating a dependency failure onto a declared code
  Given a GET route with declared error dependency_failed
  And a handler that mapErrs a vendor failure to dependency_failed
  When the route is invoked
  Then the body code is dependency_failed
```

## Forged internal via mapErr is normalised at public disclosure

```gherkin
Scenario: Normalising mapErr to internal at public disclosure
  Given a GET route with declared error not_found
  And a handler that mapErrs to railError internal with a secret message via as never
  When the route is invoked at default public disclosure
  Then the body code is internal
  And the body message is the constant unexpected message
  And the body has no cause
  And the secret does not appear in the JSON body
```

## CombineWithout mapErr becomes internal without throwing

```gherkin
Scenario: Surviving an E array returned as the handler Err
  Given a GET route
  And a handler that returns Result.combineWithAllErrors without mapErr via as never
  When the route is invoked
  Then the response is JSON
  And the body code is internal
  And serve did not throw
```

## ResultAsync map throw becomes internal

```gherkin
Scenario: Catching a throw inside map on ResultAsync
  Given a GET route
  And a ResultAsync handler whose map throws
  When the route is invoked
  Then the body code is internal
  And there is no unhandled rejection
```

## andTee throws are swallowed by neverthrow

```gherkin
Scenario: Observing that andTee throws leave Ok intact
  Given a GET route
  And a ResultAsync handler whose andTee throws
  When the route is invoked
  Then the response status is 200
  And the body is the successful output
```

## Recover to unserialisable Ok uses the fail-safe body

```gherkin
Scenario: Fail-safe when orElse recovers to a circular Ok
  Given a GET route with an output schema that retains extra fields
  And a handler that orElse recovers to a circular object
  When the route is invoked
  Then the response body is the constant internal JSON string
```

## Undeclared andThrough after success is internal at public

```gherkin
Scenario: Wrapping undeclared andThrough failure at public disclosure
  Given a GET route with declared error not_found
  And a handler that succeeds then andThroughs with an undeclared code
  When the route is invoked at public disclosure
  Then the body code is internal
  And the body has no cause
```
