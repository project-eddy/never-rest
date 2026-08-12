---
title: Explicit input sources
domain: contract
status: draft
---

> **Job story:** When I declare a route, I want params, query, and body as
> separate schemas so the wire cannot silently merge or drop fields that share
> a name across sources.

# Explicit input sources

Routes declare optional `params`, `query`, and `body` schemas instead of a
single flat `input`. `compileContract` requires `params` exactly when the path
has `:param` segments, and rejects `body` on GET or DELETE. `parseRouteSources`
validates each declared source independently so a body field named `id` never
overwrites path `:id`.

## Path parameters require a params schema

```gherkin
Scenario: Rejecting a parameterized path without params
  Given a route with path "/users/:id" and no params schema
  When compileContract runs
  Then it throws ContractConfigurationError naming the operation
  And the message says the path has parameters but no params schema
```

## Params schema requires path parameters

```gherkin
Scenario: Rejecting params on a static path
  Given a route with path "/users" and a params schema
  When compileContract runs
  Then it throws ContractConfigurationError naming the operation
  And the message says params is declared but the path has no parameters
```

## GET cannot declare body

```gherkin
Scenario: Rejecting body on GET
  Given a GET route that declares a body schema
  When compileContract runs
  Then it throws ContractConfigurationError
  And the message says body cannot be declared on GET
```

## DELETE cannot declare body

```gherkin
Scenario: Rejecting body on DELETE
  Given a DELETE route that declares a body schema
  When compileContract runs
  Then it throws ContractConfigurationError
  And the message says body cannot be declared on DELETE
```

## Query is allowed on POST

```gherkin
Scenario: Allowing query alongside body on POST
  Given a POST route with query and body schemas
  When compileContract runs
  Then it succeeds
```

## Params and body stay distinct after parse

```gherkin
Scenario: Parsing params and body without merging
  Given a PUT route with params { id: string } and body { id: string, name: string }
  And raw params { id: "path-id" } and body { id: "body-id", name: "Ada" }
  When parseRouteSources runs
  Then the result is Ok
  And params.id is "path-id"
  And body.id is "body-id"
```

## Query defaults apply when the key is omitted

```gherkin
Scenario: Applying query defaults on the server side
  Given a GET route with query { limit: string.transform(Number).default("10") }
  And raw query is an empty object
  When parseRouteSources runs
  Then the result is Ok
  And query.limit is 10
```
