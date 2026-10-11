---
title: Mandatory operation policy
domain: policy
status: draft
---

> **Job story:** When I register handlers, I want every operation to have an
> explicit public or authorizing entry, so a raw local or HTTP call cannot
> skip authorization by omitting a wrapper.

# Mandatory operation policy

`definePolicy` checks coverage at construction. Failures deny. Local callers
supply the principal; HTTP verifies from headers before the body is read.

## Missing coverage

```gherkin
Scenario: Throwing when an operation is missing from the policy map
  Given a contract with getDoc and health
  And a policy map that only lists getDoc
  When definePolicy is called
  Then it throws ContractConfigurationError
```

## Local principal required

```gherkin
Scenario: Returning unauthenticated for a protected local call without a principal
  Given a policy that protects getDoc
  When the dispatcher calls getDoc without a principal
  Then the result is Err with code "boundary.unauthenticated"
```

## Verifier throw denies

```gherkin
Scenario: Turning a throwing verifier into an unauthenticated HTTP error
  Given serve configured with a verify function that throws
  When GET /docs/1 is invoked
  Then the response status is 401
  And the body code is "boundary.unauthenticated"
```

## Public exception

```gherkin
Scenario: Letting a public operation run without a principal
  Given a policy that marks health as public
  When the dispatcher calls health
  Then the result is Ok
```
