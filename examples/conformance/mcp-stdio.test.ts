import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createDispatcher } from '@eddy-works/never-rest/local';
import { registerContract } from '@eddy-works/never-rest/mcp';
import { ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import { catalogContract } from '../mcp-stdio/src/contract.js';

describe('mcp-stdio example contract', () => {
  it('lists health and getItem and returns structured getItem output', async () => {
    const dispatcher = createDispatcher(catalogContract, {
      health: () => ok({ ok: true as const }),
      getItem: ({ params }) =>
        ok({ id: params.id, title: `Item ${params.id}` }),
    });
    const server = new Server(
      { name: 'mcp-stdio-conformance', version: '0.0.0' },
      { capabilities: { tools: {} } },
    );
    registerContract(server, dispatcher, { contract: catalogContract });

    const client = new Client({ name: 'conformance', version: '0.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual(['health', 'getItem']);

    const result = await client.callTool({
      name: 'getItem',
      arguments: { id: '42' },
    });
    expect(result.structuredContent).toEqual({ id: '42', title: 'Item 42' });
  });
});
