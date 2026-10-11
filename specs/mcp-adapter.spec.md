---
title: Contract to MCP tools
domain: mcp
status: draft
---

> **Job story:** When a host already speaks MCP, I want the same `ContractDef`
> to appear as tools, so agents call typed operations without a second API
> and without the adapter inventing its own authorization.

# Contract to MCP tools

`toMcpTools(contract)` projects each operation to an MCP tool. The tool's
input schema is the route's single declared source (`params`, `query`,
`body`, or `headers`). Routes with two or more sources fail at construction.

`registerContract(server, dispatcher, options)` lists those tools and
forwards `tools/call` to `dispatcher.dispatch`. Authorization, disclosure
and cancellation stay on the dispatcher. The adapter rejects unknown
argument keys, passes the request `AbortSignal`, and never writes to
stdout.

## Projecting a single-source operation

```gherkin
Scenario: Projecting a GET operation to a read-only tool
  Given a contract with getItem declaring params id and a summary
  When toMcpTools runs
  Then there is a tool named getItem
  And the tool description is the route summary
  And the tool sets readOnlyHint
  And the input schema forbids additional properties
```

## Rejecting multiple input sources

```gherkin
Scenario: Refusing an operation with query and body
  Given a contract with search declaring both query and body
  When toMcpTools runs
  Then construction throws ContractConfigurationError
```

## Dispatching a successful call

```gherkin
Scenario: Calling an operation through the in-memory MCP transport
  Given a dispatcher for getItem that returns Ok
  And registerContract on a protocol server
  When the MCP client calls getItem with id "a"
  Then the result is not an error
  And structuredContent matches the handler output
```

## Rejecting unknown argument keys

```gherkin
Scenario: Rejecting an extra tool argument
  Given a getItem tool whose params schema has only id
  When the MCP client calls getItem with id "a" and extra "nope"
  Then the result is an error
  And the structured content code is "validation_error"
  And the dispatcher is not invoked
```

## Passing principal and signal

```gherkin
Scenario: Forwarding principal and abort signal to dispatch
  Given registerContract with resolvePrincipal returning project "alpha"
  And a dispatcher that records call options
  When the MCP client calls getItem
  Then dispatch received principal project "alpha"
  And dispatch received the request AbortSignal
```

## Surfacing disclosed errors

```gherkin
Scenario: Returning a disclosed RailError as an MCP tool error
  Given a dispatcher that returns Err with code "boundary.forbidden"
  When the MCP client calls getItem
  Then the result is an error
  And structuredContent code is "boundary.forbidden"
```

## Unknown tool name

```gherkin
Scenario: Calling a tool that is not in the contract
  Given a registered contract with only getItem
  When the MCP client calls missing
  Then the result is an error
  And structuredContent code is "route_not_found"
```

## No stdout writes

```gherkin
Scenario: Listing and calling tools without writing stdout
  Given a registered contract
  When the MCP client lists tools and calls getItem
  Then process stdout is unchanged
```
