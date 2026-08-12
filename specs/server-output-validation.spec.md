---
title: Always-on server output validation
domain: server
status: draft
---

> **Job story:** When a handler returns successfully, I want the library to always
> validate and serialise the parsed output schema value, so contract drift and
> extra handler fields never reach the wire.

# Always-on server output validation

`serve` always validates successful handler values through `route.output` via
`parseOutput` before serialisation. The **parsed** schema value is what gets
serialised — not the handler's raw return value. Schemas may strip unknown
fields, coerce types, or apply transforms; the wire body reflects the schema
result only. Handler `Err` results and thrown exceptions are unchanged.
Validation failures map to the route's declared `internal` status with a
generic top-level message and diagnostic detail nested under `cause` (code
`output_validation_failed`), so graded disclosure can redact them for untrusted
callers.

## Output schema is always consulted

```gherkin
Scenario: Validating every successful handler response
  Given a route with an output schema and a handler that returns a conforming value
  When the route is invoked successfully
  Then the response status is 200
  And the response body equals the parsed schema output
  And the output schema validate function is called
```

## Parsed output is serialised, not the handler value

```gherkin
Scenario: Stripping undeclared fields from the wire body
  Given a route with an output schema that does not declare an extra field
  And a handler that returns a value including that extra field
  When the route is invoked successfully
  Then the response status is 200
  And the response body equals only the schema-defined fields
  But the response body does not include the extra field
```

## Non-conforming output returns declared internal 500

```gherkin
Scenario: Mapping output validation failure to internal
  Given a route with an output schema
  And a handler that returns a value that does not conform to the output schema
  When the route is invoked
  Then the response status is the declared internal status
  And the response body has code "internal"
  And the response body message is a generic unexpected-error message
  And validation issue paths appear only under cause with code "output_validation_failed"
```

## Public-disclosure failure exposes no schema field paths

```gherkin
Scenario: Redacting output validation detail at public disclosure
  Given a route with public disclosure
  And a handler that returns output failing schema validation on a named field
  When the route is invoked
  Then the response status is the declared internal status
  And the serialised error body contains no schema field path segments
```

## Unserialisable success falls back to constant internal body

```gherkin
Scenario: Returning a constant internal body when success output cannot be serialised
  Given a route with an output schema that accepts a handler value
  And a handler that returns a value which cannot be JSON-serialised
  When the route is invoked
  Then the response status is the declared internal status
  And the response body is a constant internal JSON envelope
```
