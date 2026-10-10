---
title: Bounded request body reads
domain: server
status: draft
---

> **Job story:** When an unknown or unauthenticated caller sends a huge or slow
> body, I want the library to stop reading at a declared limit, so a handler
> gate cannot be the first thing that bounds cost.

# Bounded request body reads

`serve` and `toNodeHandler` enforce byte and time limits at the layer that
reads bytes. Unknown routes do not get unbounded buffering.

## Oversized Content-Length

```gherkin
Scenario: Rejecting an oversized Content-Length before reading bytes
  Given a maxBodyBytes limit of 16
  And a request whose Content-Length is 9999999
  When readBoundedJsonBody is called
  Then the result is Err with code "boundary.payload_too_large"
```

## Chunked body without a length header

```gherkin
Scenario: Bounding a chunked body with no Content-Length
  Given a maxBodyBytes limit of 8
  And a POST body longer than 8 bytes with no Content-Length
  When readBoundedJsonBody is called
  Then the result is Err with code "boundary.payload_too_large"
```

## Slow trickle

```gherkin
Scenario: Timing out a slow trickle
  Given a bodyTimeoutMs of 5
  And a request body that pauses between chunks
  When readBoundedJsonBody is called
  Then the result is Err with code "boundary.request_timeout"
```

## Node Content-Length gate

```gherkin
Scenario: Rejecting an oversized Content-Length before invoking the fetch handler
  Given toNodeHandler configured with maxBodyBytes 16
  And a raw POST whose Content-Length is 999999
  When the Node server receives the request
  Then the response status is 413
  And the fetch handler is not invoked
```
