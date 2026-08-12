---
title: Contract compilation and handler completeness
domain: contract
status: draft
---

> **Job story:** When I define a contract, I want invalid route patterns and
> incomplete handler maps rejected at construction so neither side can compile
> a lie into the wire.

# Contract compilation and handler completeness

`compileContract` validates every route before client or server construction.
Duplicate literal paths, trailing-slash aliases, compiled matcher collisions,
duplicate path parameter names, reserved domain error codes, and duplicate error
codes within a route all throw `ContractConfigurationError` naming the
conflicting operations. `assertHandlersComplete` ensures every operation key
maps to a function handler. `matchPath` decodes path captures safely and returns
`invalid_encoding` instead of throwing on malformed percent sequences.

## Duplicate compiled matchers are rejected

```gherkin
Scenario: Rejecting duplicate compiled matchers on one method
  Given a contract with GET /users/:id on operation "getById"
  And a contract with GET /users/:userId on operation "getByUserId"
  When compileContract is called
  Then ContractConfigurationError is thrown
  And the error names operations "getById" and "getByUserId"
```

## Duplicate path parameter names are rejected

```gherkin
Scenario: Rejecting duplicate path parameter names in one path
  Given a contract route with path /a/:id/b/:id
  When compileContract is called
  Then ContractConfigurationError is thrown
  And the error names the duplicate parameter "id"
```

## Trailing-slash collision is rejected

```gherkin
Scenario: Rejecting trailing-slash path aliases on one method
  Given a contract with GET /users on operation "listUsers"
  And a contract with GET /users/ on operation "listUsersSlash"
  When compileContract is called
  Then ContractConfigurationError is thrown
  And the error names operations "listUsers" and "listUsersSlash"
```

## Reserved error codes cannot be domain codes

```gherkin
Scenario: Rejecting reserved error codes as domain codes
  Given a contract route that declares error code "internal"
  When compileContract is called
  Then ContractConfigurationError is thrown
  And the error names the reserved code "internal"
```

## Missing handlers fail at construction

```gherkin
Scenario: Rejecting an incomplete handler map
  Given a compiled contract with operations "getUser" and "deleteUser"
  And a handler map containing only "getUser"
  When assertHandlersComplete is called
  Then ContractConfigurationError is thrown
  And the error names the missing operation "deleteUser"
```

## Non-function handlers fail at construction

```gherkin
Scenario: Rejecting a non-function handler value
  Given a compiled contract with operation "getUser"
  And a handler map where "getUser" is not a function
  When assertHandlersComplete is called
  Then ContractConfigurationError is thrown
  And the error names operation "getUser"
```
