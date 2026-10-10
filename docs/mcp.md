---
title: MCP adapter
description: Project a ContractDef to MCP tools. Authorization stays on createDispatcher.
---

# MCP adapter

`@eddy-works/never-rest/mcp` maps a `ContractDef` onto MCP tools. It does
**not** authorize. Put `definePolicy` on `createDispatcher`; the adapter only
translates `tools/list` and `tools/call`.

This page describes the current module. It is not a spec.

## When to use

Use this when a host already speaks MCP (stdio, an editor, an agent runtime)
and you want the same operations as `./local` and HTTP. Do not use it as a
second permission system.

`@modelcontextprotocol/sdk` is an optional peer. `toMcpTools` does not import
it. `registerContract` does.

## Rules

- Each exposed operation must declare **zero or one** of `params`, `query`,
  `body`, `headers`. Two sources throw `ContractConfigurationError`.
- Tool schemas set `additionalProperties: false`. Extra keys become
  `validation_error` before `dispatch`.
- GET routes set `readOnlyHint: true`.
- Success goes in `structuredContent`. Failures set `isError` with the
  disclosed `RailError`.
- The MCP request `AbortSignal` is `signal`. `resolvePrincipal` supplies the
  principal.
- The module writes nothing to stdout.

## Example

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDispatcher } from '@eddy-works/never-rest/local';
import { registerContract } from '@eddy-works/never-rest/mcp';
import { definePolicy } from '@eddy-works/never-rest/policy';

const policy = definePolicy(contract, {
  operations: {
    health: 'public',
    getItem: ({ principal, args }) => canRead(principal, args),
  },
});

const dispatcher = createDispatcher(contract, handlers, { policy });
const server = new McpServer({ name: 'app', version: '1.0.0' });

registerContract(server, dispatcher, {
  contract,
  resolvePrincipal: () => principalFromLocalConfig(),
});

await server.connect(new StdioServerTransport());
```

Runnable copy: [`examples/mcp-stdio`](../examples/mcp-stdio). Spec:
[`specs/mcp-adapter.spec.md`](../specs/mcp-adapter.spec.md).
