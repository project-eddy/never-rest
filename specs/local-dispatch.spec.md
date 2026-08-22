---
title: In-process dispatch for a contract
domain: local
status: draft
---

> **Job story:** When two modules in the same process talk to each other, I want
> the contract to govern the call without paying for HTTP, so the boundary is
> declared and graphable even though nothing goes over a wire.

# In-process dispatch for a contract

`createLocalClient(contract, handlers, options)` returns one typed method per
operation. `createDispatcher(contract, handlers, options)` returns the same
machinery addressed by operation name, for transports that carry the operation
as a string — NDJSON sockets, MCP stdio, agent tool calls.

Both validate declared input through `parseRouteSources` and declared output
through `parseOutput`, exactly as `serve` does. Neither constructs a `Request`
or a `Response`. Per-route `errors` status maps are ignored: HTTP status is not
a local concern.

Disclosure defaults to **full**, because callers in the same process are in the
same trust circle.

## Typed client returns declared output

```gherkin
Scenario: Calling an operation through the local client
  Given a contract with a getClaim operation declaring params and output
  And a handler returning Ok with a valid claim
  When the local client calls getClaim with params zone "core"
  Then the result is Ok
  And the value matches the declared output schema
  And no Request or Response object is constructed
```

## Handler return shapes

```gherkin
Scenario: Accepting each supported handler return shape
  Given a contract with three operations
  And one handler returning Result
  And one handler returning ResultAsync
  And one handler returning a Promise of Result
  When each operation is called through the local client
  Then every result is Ok
```

## Input validation

```gherkin
Scenario: Rejecting input that violates the declared schema
  Given a claimZone operation declaring a body with a non-empty zone
  When the local client calls claimZone with an empty zone
  Then the result is Err with code "validation_error"
  And the issue path is ["body", "zone"]
```

## Output validation

```gherkin
Scenario: Reporting handler output that violates the contract
  Given a getClaim operation declaring an output schema
  And a handler returning Ok with a claim missing the holder field
  When the local client calls getClaim
  Then the result is Err with code "internal"
  And the nested cause has code "output_validation_failed"
```

## Declared domain errors pass through

```gherkin
Scenario: Surfacing a declared domain error unchanged
  Given a getClaim operation declaring error code "not_found"
  And a handler returning Err with code "not_found"
  When the local client calls getClaim
  Then the result is Err with code "not_found"
  And the message is the handler's message
```

## Thrown handlers stay on the railway

```gherkin
Scenario: Converting a thrown handler into a rail error
  Given a handler that throws an Error with message "handler exploded"
  When the local client calls that operation
  Then the result is Err with code "internal"
  And the nested cause message is "handler exploded"
  And no exception escapes the client
```

## Construction rejects incomplete handlers

```gherkin
Scenario: Failing fast when an operation has no handler
  Given a contract with three operations
  And a handlers object providing only one
  When createLocalClient is called
  Then it throws ContractConfigurationError
  And the message names the missing operation
```

## Dispatcher enumerates operations

```gherkin
Scenario: Listing the operations a dispatcher can serve
  Given a contract with getClaim, claimZone, and listClaims
  When the dispatcher's operations are read
  Then they are ["getClaim", "claimZone", "listClaims"]
```

## Unknown operations

```gherkin
Scenario: Rejecting an operation outside the contract
  Given a dispatcher for a contract without a "nope" operation
  When dispatch is called with operation "nope"
  Then the result is Err with code "route_not_found"
  And the message names the requested operation
```

## Context binding

```gherkin
Scenario: Preferring per-call context over bound context
  Given a dispatcher constructed with context agent "agent-9"
  And a handler that echoes context.agent
  When dispatch is called with context agent "agent-override"
  Then the echoed agent is "agent-override"
```

## Origin stamping

```gherkin
Scenario: Stamping origin on errors the dispatcher raises
  Given a dispatcher constructed with origin "atc"
  When dispatch produces a validation error
  Then the error origin is "atc"
```

## Origin already set by the handler

```gherkin
Scenario: Leaving an origin set by the handler intact
  Given a dispatcher constructed with origin "atc"
  And a handler returning Err with origin "garden"
  When dispatch is called
  Then the error origin is "garden"
```

## Disclosure defaults to the trust circle

```gherkin
Scenario: Keeping the cause chain by default
  Given a dispatcher constructed without a disclosure option
  And a handler that throws with message "inner detail"
  When dispatch is called
  Then the error has a cause with message "inner detail"
```

## Narrowing disclosure on request

```gherkin
Scenario: Narrowing disclosure on request
  Given a dispatcher constructed with disclosure "public"
  And a handler that throws with message "inner detail"
  When dispatch is called
  Then the error has no cause property
  And the serialised error contains no substring "inner detail"
```

## Ctx survives local dispatch

```gherkin
Scenario: Carrying diagnostic ctx through in-process dispatch
  Given a handler returning Err with ctx gate "atc" and category "zone_held"
  And a dispatcher at default disclosure
  When dispatch is called
  Then the error ctx includes gate "atc"
  And the error ctx includes category "zone_held"
```
