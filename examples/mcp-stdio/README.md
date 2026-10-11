# MCP stdio example

Maps a never-rest contract onto MCP tools over stdio. Authorization is
`definePolicy` on `createDispatcher`; the adapter only translates the protocol.

```bash
pnpm --filter @never-rest-examples/mcp-stdio start
```

Point an MCP client at that command. Tools: `health`, `getItem`.
