---
title: Typed boundary errors
domain: errors
status: draft
---

> **Job story:** When a gateway returns HTML or an empty body, I want 401 / 429
> / 503 to stay typed, so I can retry or re-authenticate without treating a
> proxy page as an internal bug.

# Typed boundary errors

Reserved `boundary.*` codes are host-owned. Domain contracts cannot declare
them. `retryAfterMs` is public-safe.

## Status-first mapping without an envelope

```gherkin
Scenario: Classifying an HTML 429 as rate limited
  Given a GET route expecting JSON errors
  And an HTTP 429 response with an HTML body and Retry-After "2"
  When mapResponse is called
  Then the result is Err with code "boundary.rate_limited"
  And retryAfterMs is 2000
  But the error message does not contain the HTML
```

## Envelope and status must agree

```gherkin
Scenario: Wrapping a status and envelope mismatch as internal
  Given a route that declares not_found as 404
  And a JSON envelope with code "not_found" on HTTP 500
  When mapResponse is called
  Then the result is Err with code "internal"
  And the cause code is "not_found"
```

## Contract compilation rejects the prefix

```gherkin
Scenario: Rejecting a domain code in the boundary namespace
  Given a route that declares errors boundary.forbidden 403
  When compileContract is called
  Then it throws ContractConfigurationError
```
