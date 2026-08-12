---
title: Graded error disclosure by caller trust
domain: errors
status: draft
---

> **Job story:** When an error crosses a trust boundary, I want the library to
> redact detail proportional to the caller's disclosure level, so internal
> diagnostics never leak to untrusted clients.

# Graded error disclosure by caller trust

`disclose(error, level)` shapes a `RailError` for the audience. Three levels
exist: **full** (same trust circle — everything including the cause chain),
**internal** (code, message, issues, nextStep — cause chain dropped), and
**public** (code and a safe message only). Public must never leak `cause`,
`origin`, nested diagnostic text, or `issues` paths that reveal internal field
names. This file is security-relevant: every leak case is explicit.

## Full disclosure

```gherkin
Scenario: Disclosing everything at full level
  Given a RailError with code "upstream_failed"
  And message "Gateway could not complete the request"
  And origin "api-gateway"
  And nextStep "Retry after 30 seconds"
  And a nested cause with code "db_timeout" and message "connection pool exhausted"
  When disclose is called with level "full"
  Then the result includes code "upstream_failed"
  And the result includes message "Gateway could not complete the request"
  And the result includes origin "api-gateway"
  And the result includes nextStep "Retry after 30 seconds"
  And the result includes a cause with code "db_timeout"
```

## Internal disclosure

```gherkin
Scenario: Dropping the cause chain at internal level
  Given a RailError with code "upstream_failed" and message "Gateway failed"
  And nextStep "Check downstream health"
  And a nested cause with code "db_timeout" and message "pool exhausted"
  When disclose is called with level "internal"
  Then the result includes code "upstream_failed"
  And the result includes message "Gateway failed"
  And the result includes nextStep "Check downstream health"
  But the result has no cause property
```

## Public disclosure — safe surface

```gherkin
Scenario: Exposing only safe fields at public level
  Given a RailError with code "not_found" and message "Resource not found"
  And nextStep "Verify the identifier and try again"
  When disclose is called with level "public"
  Then the result includes code "not_found"
  And the result includes message "Resource not found"
  And the result includes nextStep "Verify the identifier and try again"
```

## Public must not leak cause

```gherkin
Scenario: Stripping nested cause from public disclosure
  Given a RailError with code "upstream_failed" and message "Something went wrong"
  And a nested cause with message "SELECT * FROM internal_users WHERE id = 7 failed"
  When disclose is called with level "public"
  Then the result has no cause property
  And the serialised result contains no substring from the nested cause message
  But the result includes code "upstream_failed"
```

## Public must not leak origin

```gherkin
Scenario: Stripping service origin from public disclosure
  Given a RailError with code "internal" and message "An error occurred"
  And origin "billing-service-internal"
  When disclose is called with level "public"
  Then the result has no origin property
  And the serialised result contains no substring "billing-service-internal"
```

## Public must not leak validation issues

```gherkin
Scenario: Stripping issues that reveal internal field names from public disclosure
  Given a RailError with code "validation_error" and message "Invalid input"
  And an issue at path ["_internal", "shardKey"] with message "must be a UUID"
  When disclose is called with level "public"
  Then the result has no issues property
  And the serialised result contains no substring "_internal"
  And the serialised result contains no substring "shardKey"
```

## Public drops diagnostic nextStep

```gherkin
Scenario: Dropping diagnostic nextStep from public disclosure
  Given a RailError with code "internal" and message "An error occurred"
  And nextStep "Inspect heap dump at /var/run/debug.hprof"
  When disclose is called with level "public"
  Then the result has no nextStep property
  And the serialised result contains no substring "heap dump"
```

## Respond applies disclosure

```gherkin
Scenario: Applying disclosure when respond renders an error
  Given respond options with disclosure "public"
  And a status map where "internal" maps to 500
  And declared error statuses including 500
  And an Err result carrying a RailError with origin "worker-3"
  And a nested cause with message "secret token mismatch"
  When respond is called with that result and options
  Then the response body has no origin property
  And the response body has no cause property
  And the serialised body contains no substring "secret token mismatch"
```

## Serve defaults omitted disclosure to public

```gherkin
Scenario: Redacting cause when serve disclosure is omitted
  Given serve configured without a disclosure option
  And a handler that returns an undeclared error code with a nested cause
  When the route is invoked
  Then the response body has no cause property
  And the serialised body matches the response with explicit public disclosure
```

## Forged internal is normalised at public disclosure

```gherkin
Scenario: Hiding handler-forged internal messages at public disclosure
  Given serve configured without a disclosure option
  And a handler that returns Err with code "internal" and a sensitive message
  When the route is invoked
  Then the response body has code "internal"
  And the response body message is a generic unexpected-error message
  But the serialised body contains no substring from the sensitive message
```

## Disclosure callback failure falls back to public

```gherkin
Scenario: Completing the request when a disclosure callback throws
  Given serve configured with a disclosure callback that throws
  And a handler that returns an undeclared error code
  When the route is invoked
  Then the response completes successfully
  And the response body has no cause property
```
