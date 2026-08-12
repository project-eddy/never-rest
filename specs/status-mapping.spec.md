---
title: Mapping RailError codes to HTTP statuses
domain: errors
status: draft
---

> **Job story:** When a handler returns `Err(RailError)`, I want the library to
> map it onto a declared HTTP status for that route, so callers never receive an
> undeclared response shape.

# Mapping RailError codes to HTTP statuses

Handlers return `Result` values; the server must translate `RailError` codes
into HTTP status codes using a consumer-supplied `StatusMap`. Routes declare
which statuses they may emit; any error whose mapped status is not declared
degrades to **500** while preserving the error body. This file specifies
`statusFor`, `toDeclaredResponse`, and the `respond` integration.

## Declared status is returned

```gherkin
Scenario: Mapping a declared error code to its HTTP status
  Given a status map where "not_found" maps to 404
  And a route declares 404 among its allowed statuses
  And a RailError with code "not_found" and message "User missing"
  When toDeclaredResponse is called with that error, map, and declared list
  Then the response status is 404
  And the response body is the same RailError
```

## Undeclared status degrades to 500

```gherkin
Scenario: Degrading an undeclared mapped status to 500
  Given a status map where "conflict" maps to 409
  And a route declares only 400 and 401 among its allowed statuses
  And a RailError with code "conflict" and message "Already exists"
  When toDeclaredResponse is called with that error, map, and declared list
  Then the response status is 500
  And the response body still has code "conflict"
  But the response status is not 409
```

## Unmatched route uses route_not_found

```gherkin
Scenario: Mapping an unmatched method or path to route_not_found
  Given a status map where "route_not_found" maps to 404
  And an incoming request that does not match any declared route
  When serve handles the request
  Then the response status is 404
  And the response body has code "route_not_found"
  But the response body does not have code "not_found"
```

## Custom status map

```gherkin
Scenario: Using a consumer-defined status map
  Given a status map where "seat_taken" maps to 409
  And a route declares 409 among its allowed statuses
  And a RailError with code "seat_taken" and message "Row 4 seat 12"
  When statusFor is called with that map and error
  Then the returned status is 409
```

## Success path through respond

```gherkin
Scenario: Returning a declared success status from respond
  Given respond options with success 200 and declared error statuses [400, 404]
  And a status map where "not_found" maps to 404
  And an Ok result carrying body { "id": "u_1" }
  When respond is called with that result and options
  Then the response status is 200
  And the response body is { "id": "u_1" }
```

## Declared error through respond

```gherkin
Scenario: Returning a declared error status from respond
  Given respond options with success 200 and declared error statuses [400, 404]
  And a status map where "not_found" maps to 404
  And an Err result carrying a RailError with code "not_found"
  When respond is called with that result and options
  Then the response status is 404
  And the response body has code "not_found"
```

## Undeclared error through respond

```gherkin
Scenario: Degrading an undeclared error status through respond
  Given respond options with success 200 and declared error statuses [400]
  And a status map where "not_found" maps to 404
  And an Err result carrying a RailError with code "not_found"
  When respond is called with that result and options
  Then the response status is 500
  And the response body has code "not_found"
  But the response status is not 404
```
