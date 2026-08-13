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
duplicate path parameter names, reserved domain error codes, invalid error
status values, invalid success statuses, and output/success mismatches all throw
`ContractConfigurationError` naming the conflicting operations.
`assertHandlersComplete` ensures every operation key maps to a function handler. `matchPath` decodes path captures safely and returns
`invalid_encoding` instead of throwing on malformed percent sequences.
`isContractPath` reports whether a pathname matches any compiled route so a
shared-process host can dispatch without duplicating the path list.

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

## Invalid error status values are rejected

```gherkin
Scenario: Rejecting error statuses outside 400-599
  Given a contract route whose errors map "not_found" to 299
  When compileContract is called
  Then ContractConfigurationError is thrown
  And the error names the invalid status for "not_found"
```

## Success 204 requires no output schema

```gherkin
Scenario: Rejecting output on a 204 route
  Given a contract route with success 204 and an output schema
  When compileContract is called
  Then ContractConfigurationError is thrown
  And the error states that success 204 must not declare output
```

## Non-204 routes require an output schema

```gherkin
Scenario: Rejecting missing output when success is not 204
  Given a contract route with default success 200 and no output schema
  When compileContract is called
  Then ContractConfigurationError is thrown
  And the error states that output is required
```

## Invalid success statuses are rejected

```gherkin
Scenario: Rejecting success statuses outside 200, 201, 202, and 204
  Given a contract route with success 203 and an output schema
  When compileContract is called
  Then ContractConfigurationError is thrown
  And the error names the invalid success status
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

## Parameterized paths belong to the contract

```gherkin
Scenario: Matching a parameterized contract path
  Given a compiled contract with GET /users/:id
  When isContractPath is called with pathname /users/ada
  Then the result is true
```

## Unrelated paths do not belong to the contract

```gherkin
Scenario: Rejecting a path that is not on the contract
  Given a compiled contract with GET /users/:id and GET /users
  When isContractPath is called with pathname /sign-in
  Then the result is false
```

## Invalid encoding still belongs to the contract

```gherkin
Scenario: Treating invalid percent-encoding as a contract path
  Given a compiled contract with GET /users/:id
  When isContractPath is called with pathname /users/%zz
  Then the result is true
```
