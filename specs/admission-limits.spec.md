---
title: Admission limits and concurrency
domain: limits
status: draft
---

> **Job story:** When a limiter store fails or a caller floods a process, I
> want an explicit reject or fallback, so the library never silently allows
> unlimited work.

# Admission limits and concurrency

Memory limiters expire keys and cap cardinality. Concurrency slots are
released on every exit. `onStoreFailure` is required.

## Point budget

```gherkin
Scenario: Allowing consumption up to the point budget
  Given a memory limiter with 2 points
  When consume is called three times for the same key
  Then the first two results are allowed
  And the third result is limited
```

## Key cardinality

```gherkin
Scenario: Limiting new keys once the cardinality cap is reached
  Given a memory limiter with maxKeys 1
  And one existing key
  When consume is called for a second key
  Then the result is limited
```

## Store failure adapter

```gherkin
Scenario: Mapping an Error rejection to limiter_unavailable
  Given a rate-limiter-flexible adapter whose consume throws Error
  When consume is called
  Then the result is Err with code "limiter_unavailable"
```

## Queue abort

```gherkin
Scenario: Removing a waiter when the signal aborts
  Given a concurrency gate with one in-flight slot
  And a queued acquire
  When the queued signal is aborted
  Then the queued result is Err with code "boundary.cancelled"
```
