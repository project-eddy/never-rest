---
title: Mapping HTTP responses to client Results
domain: client
status: draft
---

> **Job story:** When the typed client calls a route, I want every outcome
> returned as a composable `ResultAsync` — never a throw — so failures chain
> with `andThen` and `mapErr`.

# Mapping HTTP responses to client Results

`createClient` builds one function per contract operation. Network failures,
parse failures, and error responses all become `Err(RailError)`; successful
2xx bodies parse into `Ok`. An error whose code is not declared on the route
becomes `Err` with code `internal`. Composed calls short-circuit: when the
first call returns `Err`, the second is never invoked.

## Declared error becomes Err

```gherkin
Scenario: Mapping a declared JSON error to Err
  Given a contract route that declares error code "not_found"
  And a fetch stub returning status 404
  And a JSON body with code "not_found" and message "User missing"
  When the client operation is called
  Then the result is Err
  And the error has code "not_found"
  And the error message is "User missing"
```

## Undeclared error becomes internal Err

```gherkin
Scenario: Mapping an undeclared error code to internal Err
  Given a contract route that declares only error code "validation_error"
  And a fetch stub returning status 500
  And a JSON body with code "database_corrupt" and message "WAL segment missing"
  When the client operation is called
  Then the result is Err
  And the error has code "internal"
  But the error code is not "database_corrupt"
```

## Non-JSON error becomes internal Err

```gherkin
Scenario: Mapping an unparseable response body to internal Err
  Given a contract route with a declared output schema
  And a fetch stub returning status 200 with body "not json"
  When the client operation is called
  Then the result is Err
  And the error has code "internal"
```

## Network failure becomes retryable Err

```gherkin
Scenario: Mapping a network failure to a retryable Err
  Given a contract route
  And a fetch stub that rejects with a network error
  When the client operation is called
  Then the result is Err
  And the error has code "unavailable"
  And the error is marked retryable
```

## Success becomes Ok

```gherkin
Scenario: Mapping a 2xx JSON body to Ok
  Given a contract route with an output schema expecting { "id": string }
  And a fetch stub returning status 200
  And a JSON body { "id": "u_42" }
  When the client operation is called
  Then the result is Ok
  And the value has id "u_42"
```

## Chains short-circuit on first Err

```gherkin
Scenario: Short-circuiting a composed client chain on the first Err
  Given a client with operations getUser and loadOrders
  And getUser is stubbed to return Err with code "not_found"
  And loadOrders has a spy asserting it was never called
  When getUser is called and andThen invokes loadOrders on success
  Then the composed result is Err
  And loadOrders was not invoked
```

## Client never throws

```gherkin
Scenario: Returning Err instead of throwing on fetch failure
  Given a contract route
  And a fetch stub that throws synchronously
  When the client operation is called
  Then the promise resolves without throwing
  And the result is Err
```
