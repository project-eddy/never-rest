---
title: Opt-in server output validation
domain: server
status: draft
---

> **Job story:** When I opt in to output validation on `serve`, I want successful
> handler values checked against the route's output schema before serialisation,
> so contract drift surfaces as an internal failure without rewriting passing
> responses.

# Opt-in server output validation

`serve` accepts `validateOutput?: boolean` on `ServeOptions`. Only `true` enables
validation. When enabled, a successful handler `Ok` value is validated through
`route.output` before the response is serialised. The handler's own value is
always serialised on success — the schema result is a pass/fail gate only. Handler
`Err` results and thrown exceptions are unchanged. Failures map to the route's
declared `internal` status with a generic top-level message and diagnostic detail
(including issue paths) nested under `cause`, so graded disclosure can redact them
for untrusted callers.

## Validation disabled leaves the body untouched

```gherkin
Scenario: Skipping output schema work when validation is off
  Given a route with an output schema and a handler that returns a conforming value
  And serve is configured without validateOutput or with validateOutput false
  When the route is invoked successfully
  Then the response status is 200
  And the response body equals the handler return value
  But the output schema validate function is not called
```

## Enabled and conforming returns 200

```gherkin
Scenario: Returning the handler value when output validation passes
  Given a route with an output schema and validateOutput true
  And a handler that returns a value conforming to the output schema
  When the route is invoked successfully
  Then the response status is 200
  And the response body equals the handler return value exactly
```

## Enabled and non-conforming returns declared internal 500

```gherkin
Scenario: Mapping output validation failure to internal
  Given a route with an output schema and validateOutput true
  And a handler that returns a value that does not conform to the output schema
  When the route is invoked
  Then the response status is the declared internal status
  And the response body has code "internal"
  And the response body message is a generic unexpected-error message
  And validation issue paths appear only under cause
```

## Public-disclosure failure exposes no schema field paths

```gherkin
Scenario: Redacting output validation detail at public disclosure
  Given a route with validateOutput true and public disclosure
  And a handler that returns output failing schema validation on a named field
  When the route is invoked
  Then the response status is the declared internal status
  And the serialised error body contains no schema field path segments
```
