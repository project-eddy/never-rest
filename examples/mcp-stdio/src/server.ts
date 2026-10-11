import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createDispatcher } from '@eddy-works/never-rest/local';
import { registerContract } from '@eddy-works/never-rest/mcp';
import { definePolicy } from '@eddy-works/never-rest/policy';
import { ok } from 'neverthrow';

import { catalogContract } from './contract.js';

const policy = definePolicy(catalogContract, {
  operations: {
    health: 'public',
    getItem: 'public',
  },
});

const dispatcher = createDispatcher(
  catalogContract,
  {
    health: () => ok({ ok: true as const }),
    getItem: ({ params }) =>
      ok({ id: params.id, title: `Item ${params.id}` }),
  },
  { policy, origin: 'mcp-stdio-example' },
);

const server = new McpServer({
  name: 'never-rest-mcp-stdio',
  version: '0.0.0',
});

registerContract(server, dispatcher, { contract: catalogContract });

const transport = new StdioServerTransport();
await server.connect(transport);
