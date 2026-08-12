---
title: Client wire serialization
domain: client
status: draft
---

> **Job story:** When the typed client builds a request, I want query and path
> values encoded predictably or rejected before fetch — never silently dropped —
> so the wire matches what both sides validated.

# Client wire serialization

`buildRequest` uses the precompiled path from `compileContract`, validates path
parameters before fetch, and serializes GET/DELETE remainder fields as query
parameters. Primitives and dates become scalar keys; arrays of primitives or
dates use a `key[]` suffix even for a single element. `undefined` and `null`
are omitted. Empty arrays, nested objects, bigint, and nested arrays return
`validation_error` before fetch. POST bodies and headers are built inside a
railway boundary: invalid headers, circular JSON, and bigint bodies return
`internal` without throwing.

## Array query params use bracket suffix

```gherkin
Scenario: Serializing array query params with a bracket suffix
  Given a GET route with input { tags: string[] }
  And client input { tags: ["a", "b"] }
  When the client operation is called
  Then fetch is called with URL query tags[]=a&tags[]=b
```

## Single-element array still uses bracket suffix

```gherkin
Scenario: Serializing a single-element array with a bracket suffix
  Given a GET route with input { tags: string[] }
  And client input { tags: ["a"] }
  When the client operation is called
  Then fetch is called with URL query tags[]=a
```

## Empty array is validation_error before fetch

```gherkin
Scenario: Returning validation_error for an empty array query param before fetch
  Given a GET route with input { tags: string[] }
  And client input { tags: [] }
  When the client operation is called
  Then the result is Err with code validation_error
  And fetch was not called
```

## Unrepresentable query values are validation_error before fetch

```gherkin
Scenario: Returning validation_error for nested object query values before fetch
  Given a GET route whose input accepts a nested object field
  And client input with a nested object query value
  When the client operation is called
  Then the result is Err with code validation_error
  And fetch was not called
```

## Date query params serialize as ISO 8601

```gherkin
Scenario: Serializing Date query params as ISO 8601 scalars
  Given a GET route with input { since: Date }
  And client input with since set to a known instant
  When the client operation is called
  Then fetch is called with URL query since equal to that instant in ISO 8601
```

## Missing path parameter is validation_error before fetch

```gherkin
Scenario: Returning validation_error for a missing path parameter before fetch
  Given a GET route with path /users/:id
  And client input missing id
  When the client operation is called
  Then the result is Err with code validation_error naming id
  And fetch was not called
```

## Empty path parameter is validation_error before fetch

```gherkin
Scenario: Returning validation_error for an empty path parameter before fetch
  Given a GET route with path /users/:id
  And client input with id ""
  When the client operation is called
  Then the result is Err with code validation_error naming id
  And fetch was not called
```

## Defaulted query fields are omitted from the wire

```gherkin
Scenario: Omitting a defaulted query field instead of sending the default value
  Given a GET route with input { limit: number defaulting to 10 }
  And client input with limit omitted
  When the client operation is called
  Then fetch is called without a limit query parameter
```

## Transforming input uses client InferInput on the wire

```gherkin
Scenario: Accepting client InferInput for a transforming input schema
  Given a GET route with input { limit: string transforming to number }
  And client input with limit "42"
  When the client operation is called
  Then fetch is called with query limit=42 as the string value
  And the result is Ok when the response matches the output schema
```

## Invalid headers return internal without fetch

```gherkin
Scenario: Returning internal Err for an invalid header value on GET
  Given a GET route
  And client options with a header value containing a newline
  When the client operation is called
  Then the result is Err with code internal
  And fetch was not called
```

## Circular POST body returns internal without throwing

```gherkin
Scenario: Returning internal Err for a circular POST body without throwing
  Given a POST route with a JSON body
  And client input forming a circular object reference
  When the client operation is called
  Then the promise resolves without throwing
  And the result is Err with code internal
  And fetch was not called
```

## Precompiled paths avoid per-request compilePath

```gherkin
Scenario: Not calling compilePath on each request
  Given a client built from a contract
  When two operations are invoked
  Then compilePath was not called during those invocations
```
