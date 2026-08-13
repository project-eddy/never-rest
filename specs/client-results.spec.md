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
parse failures, and error responses all become `Err(RailError)`; a response
matches success only when its status equals the route's declared success
(`route.success ?? 200`). Matching success bodies parse into `Ok`; `success: 204`
routes resolve `Ok(undefined)` without reading a body. Any other 2xx status is
`validation_error` before the body is trusted. Declared domain codes,
`validation_error`, and `internal` pass through when the wire envelope is
well-formed. An error whose code is not declared on the route becomes `Err` with
code `internal`, message "Unexpected error response", and the remote error nested
as `cause`. Malformed envelopes or cause chains deeper than 16 hops become
`internal` with message "Unexpected error response". Composed calls
short-circuit: when the first call returns `Err`, the second is never invoked.
Per-route request headers merge over `ClientOptions.headers`, with per-call
values winning, and validate against `route.headers` when declared.

## Success becomes Ok

```gherkin
Scenario: Mapping a declared success JSON body to Ok
  Given a contract route with success 200 and an output schema expecting { "id": string }
  And a fetch stub returning status 200
  And a JSON body { "id": "u_42" }
  When the client operation is called
  Then the result is Ok
  And the value has id "u_42"
```

## Declared 201 success becomes Ok

```gherkin
Scenario: Mapping a declared 201 success body to Ok
  Given a contract route with success 201 and an output schema
  And a fetch stub returning status 201 with a matching JSON body
  When the client operation is called
  Then the result is Ok
```

## Wrong 2xx becomes validation_error

```gherkin
Scenario: Mapping a different 2xx status to validation_error
  Given a contract route with success 201
  And a fetch stub returning status 200 with a JSON body
  When the client operation is called
  Then the result is Err
  And the error has code "validation_error"
  And the error message names the expected success status
```

## 204 success becomes Ok without reading the body

```gherkin
Scenario: Resolving a 204 route to Ok without reading the response body
  Given a contract route with success 204 and no output schema
  And a fetch stub returning status 204 with no body
  When the client operation is called
  Then the result is Ok
  And the value is undefined
  And response.text was not called
```

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

## validation_error envelope becomes Err

```gherkin
Scenario: Mapping a validation_error envelope to Err
  Given a contract route
  And a fetch stub returning status 400
  And a JSON body with code "validation_error", message "Validation failed", and issues
  When the client operation is called
  Then the result is Err
  And the error has code "validation_error"
  And the error includes the wire issues
```

## Undeclared error becomes internal Err with cause

```gherkin
Scenario: Mapping an undeclared error code to internal Err with remote cause
  Given a contract route that declares only error code "not_found"
  And a fetch stub returning status 500
  And a JSON body with code "database_corrupt" and message "WAL segment missing"
  When the client operation is called
  Then the result is Err
  And the error has code "internal"
  And the error message is "Unexpected error response"
  And the error cause has code "database_corrupt"
```

## Malformed envelope becomes internal Err

```gherkin
Scenario: Mapping a malformed error envelope to internal Err
  Given a contract route that declares error code "not_found"
  And a fetch stub returning status 400
  And a JSON body with code "not_found" but message is not a string
  When the client operation is called
  Then the result is Err
  And the error has code "internal"
  And the error message is "Unexpected error response"
```

## Deep cause preserved within bound

```gherkin
Scenario: Preserving a bounded nested cause on a declared error
  Given a contract route that declares error code "not_found"
  And a fetch stub returning status 404
  And a JSON body with code "not_found" and a valid nested cause within depth 16
  When the client operation is called
  Then the result is Err
  And the error has code "not_found"
  And the nested cause is preserved on the error
```

## Excessive cause depth becomes internal Err

```gherkin
Scenario: Mapping an error envelope exceeding cause depth to internal Err
  Given a contract route
  And a fetch stub returning status 500
  And a JSON error body with a cause chain deeper than 16 hops
  When the client operation is called
  Then the result is Err
  And the error has code "internal"
  And the error message is "Unexpected error response"
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

## Sync-throwing headers callback becomes internal Err

```gherkin
Scenario: Returning internal Err when a headers callback throws synchronously
  Given a contract route
  And client options whose headers callback throws synchronously
  When the client operation is called
  Then the result is Err
  And the error has code "internal"
  And fetch was not called
```

## Declared request headers round-trip on the wire

```gherkin
Scenario: Sending merged request headers on the wire
  Given a GET route that declares headers { "x-request-id": string }
  And client options with global header authorization Bearer global
  And client args with headers { "x-request-id": "req-42" }
  When the client operation is called
  Then fetch receives a Request whose headers include x-request-id req-42
  And fetch receives authorization Bearer global
  And the result is Ok when the response matches the output schema
```

## Per-call headers override global headers

```gherkin
Scenario: Letting per-call headers override global headers for the same key
  Given a GET route that declares headers { "x-request-id": string }
  And client options with global header x-request-id global
  And client args with headers { "x-request-id": "call-wins" }
  When the client operation is called
  Then fetch receives a Request whose x-request-id header is call-wins
```
