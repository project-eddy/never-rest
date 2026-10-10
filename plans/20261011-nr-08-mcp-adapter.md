# Plan: NR-08 MCP adapter

Mission: expose a `ContractDef` as MCP tools without adding authorization
logic. Policy, disclosure, principals and cancellation stay on
`createDispatcher`. This adapter only translates MCP list/call into
`dispatch`.

Grounding: Kanon v2 needs a generic contract→MCP mapping. The 0.7 umbrella
plan lists MCP transport as out of scope, so this is a follow-on slice. It
adds files under `src/mcp/`, `examples/mcp-stdio`, and `specs/`. It does not
rewrite NR-01–NR-07.

Definition of done:

- `@eddy-works/never-rest/mcp` exports `toMcpTools` and `registerContract`.
- `@modelcontextprotocol/sdk` is an optional peer dependency.
- Each exposed operation has exactly one input source (`params` / `query` /
  `body` / `headers`). Anything else throws `ContractConfigurationError`.
- Tool input schemas set `additionalProperties: false`. Extra keys at call
  time become `validation_error` before `dispatch`.
- GET routes set `readOnlyHint: true`.
- Success uses `structuredContent`. Errors set `isError` with the disclosed
  `RailError` (including `boundary.*` codes).
- The MCP request `AbortSignal` is passed as `signal`. `resolvePrincipal`
  supplies the principal. The adapter does not authorize.
- The module writes nothing to stdout.
- Spec: `specs/mcp-adapter.spec.md`. Tests use the SDK in-memory transport.
- Example: `examples/mcp-stdio`.

Validation:

```bash
pnpm test src/mcp
pnpm exec vitest run --config examples/conformance/vitest.config.ts
pnpm typecheck
```

Depends on the 0.7 dispatcher signature:
`dispatch(operation, args, { context, principal, signal })`.

## API

```ts
const tools = toMcpTools(contract);

registerContract(server, dispatcher, {
  contract,
  resolvePrincipal: () => project,
  resolveContext: () => context,
});
```

`server` is a protocol `Server` or an `McpServer` (uses `.server`).

JSON Schema comes from `convertStandardSchema` in `src/openapi/schema.ts`.
Do not move that helper in this slice — 0.7 may still touch OpenAPI.

## What stays the same

- `definePolicy` on `createDispatcher` remains the authorization boundary.
- HTTP `serve` is unchanged.
- No OAuth, no MCP authorization server, no stdout logging.
