---
title: Chaining errors across service boundaries
domain: errors
status: draft
---

> **Job story:** When a gateway calls a downstream service that fails, I want
> the downstream error preserved as the cause of a caller-facing error, so
> operators and agents can trace failures across hops.

# Chaining errors across service boundaries

`chain(outer, cause)` wraps a downstream `RailError` as the `cause` of an
outer one. `flatten` walks the chain root-first; `formatChain` renders one line
per hop. Chains must survive `JSON.parse(JSON.stringify(error))` so they cross
network boundaries intact. The server stamps `options.origin` onto outgoing
errors when `origin` is absent.

## Gateway wraps downstream failure

```gherkin
Scenario: Chaining a downstream error through a gateway
  Given a downstream RailError with code "not_found" and message "Order missing"
  And a gateway outer error with code "upstream_failed" and message "Fulfillment unavailable"
  When chain is called with the outer fields and the downstream error as cause
  Then the result has code "upstream_failed"
  And the result has message "Fulfillment unavailable"
  And the result has a cause with code "not_found"
  And the cause message is "Order missing"
```

## Flatten order is root-first

```gherkin
Scenario: Flattening a three-deep chain root-first
  Given a root RailError with code "gateway_error" and message "top"
  And a middle cause with code "service_error" and message "middle"
  And a leaf cause with code "db_error" and message "bottom"
  When flatten is called on the root error
  Then the first entry has code "gateway_error"
  And the second entry has code "service_error"
  And the third entry has code "db_error"
```

## Format chain for operators

```gherkin
Scenario: Formatting a cause chain as one line per hop
  Given a root RailError with code "gateway_error" and message "top"
  And a nested cause with code "db_error" and message "bottom"
  When formatChain is called on the root error
  Then the output contains a line for "gateway_error"
  And the output contains a line for "db_error"
  And the gateway line appears before the database line
```

## Serialisation round-trip

```gherkin
Scenario: Preserving a three-deep chain through JSON serialisation
  Given a root RailError with code "gateway_error" and message "top"
  And a middle cause with code "service_error" and message "middle"
  And a leaf cause with code "db_error" and message "bottom"
  When the root error is serialised to JSON and parsed back
  Then the parsed error has code "gateway_error"
  And the parsed error has a cause with code "service_error"
  And the parsed cause has a cause with code "db_error"
  And the leaf message is still "bottom"
```

## Origin stamping on serve

```gherkin
Scenario: Stamping origin onto an outgoing error when absent
  Given a serve handler configured with origin "api-gateway"
  And a handler that returns Err with code "not_found" and no origin set
  When the server handles a matching request
  Then the response body has origin "api-gateway"
```

## Origin is not overwritten

```gherkin
Scenario: Preserving an existing origin on an outgoing error
  Given a serve handler configured with origin "api-gateway"
  And a handler that returns Err with code "not_found" and origin "orders-service"
  When the server handles a matching request
  Then the response body has origin "orders-service"
  But the response body origin is not "api-gateway"
```

## Gateway propagates downstream chain

```gherkin
Scenario: Bubbling a downstream cause chain through a gateway response
  Given a downstream JSON body with code "db_timeout" and message "pool exhausted"
  And a gateway that returns Err chained with code "upstream_failed"
  When the gateway response is serialised
  Then the body has code "upstream_failed"
  And the body has a cause with code "db_timeout"
  And the cause message is "pool exhausted"
```
