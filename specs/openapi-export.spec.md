---
title: OpenAPI export from contracts
domain: openapi
status: draft
---

> **Job story:** When I export a contract to OpenAPI 3.1, I want the document to
> reflect runtime wire behaviour or fail loudly — never invent schemas or statuses
> the server cannot produce.

# OpenAPI export from contracts

`toOpenAPI(contract, { info })` compiles the contract, converts Standard Schema
sources through `~standard.jsonSchema` targeting draft 2020-12, and emits paths,
operations, and shared error components. Path templates use `{param}` syntax.
Array query parameters use the bracket-array wire name (`tags[]`) matching
`buildRequest` in `src/client/request.ts`. Domain error responses use the public
`RailError` disclosure shape. The host `route_not_found` status is documented
once per OpenAPI path via `components/responses/RouteNotFound`.

## Golden fixture matches export

```gherkin
Scenario: Exporting a representative contract matches the golden fixture
  Given a fixture contract with params, query, headers, body, 200, 201, and 204 routes
  When toOpenAPI is called with title and version info
  Then the returned document deep-equals the checked-in golden JSON fixture
```

## Unsupported validators fail loudly

```gherkin
Scenario: Rejecting validators without JSON Schema conversion
  Given a contract whose body uses Valibot without JSON Schema support
  When toOpenAPI is called
  Then OpenApiExportError is thrown naming the operation and schema source
  But the document does not contain an empty object schema
```

## Array query parameters use bracket wire names

```gherkin
Scenario: Documenting array query parameters with bracket suffix names
  Given a GET route with query { tags: string[] }
  When toOpenAPI is called
  Then the operation declares a query parameter named tags[]
  And the parameter style is form with explode true
```

## Path parameters use simple style

```gherkin
Scenario: Documenting path parameters with simple style
  Given a route with path /users/:id and a params schema
  When toOpenAPI is called
  Then the OpenAPI path template is /users/{id}
  And the id parameter is in path with style simple and required true
```

## Route not found is documented once per path

```gherkin
Scenario: Documenting route_not_found once per OpenAPI path
  Given a path with multiple HTTP methods
  And the first method on that path does not declare a domain 404
  When toOpenAPI is called
  Then the first operation references components/responses/RouteNotFound
  And subsequent operations on the same path omit the duplicate route_not_found entry
```

## Documented statuses are runtime-producible

```gherkin
Scenario: Emitting only statuses the runtime can return
  Given a compiled contract with declared success and error maps
  When toOpenAPI is called
  Then every response status in the document is a declared success, domain error, or host route_not_found status
```
