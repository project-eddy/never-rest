---
title: Cancellation and explicit retry
domain: client
status: draft
---

> **Job story:** When a call is aborted or a write fails, I want retries to be
> opt-in and cancellable, so unsafe writes are not replayed and internal
> errors are not treated as automatically retryable.

# Cancellation and explicit retry

`isRetryable` no longer retries `internal` unless `retryable: true`.
`withRetry` requires `idempotent`.

## Non-idempotent calls

```gherkin
Scenario: Refusing to replay a non-idempotent call
  Given a function that returns unavailable
  When withRetry is called with idempotent false
  Then the function is invoked once
```

## Idempotent retry

```gherkin
Scenario: Retrying a retryable error when idempotent is true
  Given a function that fails once with unavailable then succeeds
  When withRetry is called with idempotent true
  Then the function is invoked twice
  And the result is Ok
```

## Abort stops retry

```gherkin
Scenario: Stopping retrying when the signal aborts
  Given a function that aborts the signal on the first call
  When withRetry is called with that signal
  Then the result is Err with code "boundary.cancelled"
```

## Internal is not retryable

```gherkin
Scenario: Leaving internal errors non-retryable
  Given a RailError with code internal and no retryable flag
  When isRetryable is called
  Then the result is false
```
