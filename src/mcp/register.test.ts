import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ok, err } from 'neverthrow';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { boundaryError } from '../boundary.js';
import type { ContractDef } from '../contract/types.js';
import { createDispatcher } from '../local/dispatch.js';
import { railError } from '../error.js';
import { registerContract } from './register.js';
import type { McpCallOptions, McpDispatcher } from './types.js';

const contract = {
  getItem: {
    method: 'GET',
    path: '/items/:id',
    params: z.object({ id: z.string() }),
    output: z.object({ id: z.string(), title: z.string() }),
    errors: { not_found: 404 },
    summary: 'Get an item by id',
  },
} satisfies ContractDef;

interface RecordedCall {
  readonly operation: string;
  readonly args: unknown;
  readonly options: McpCallOptions | undefined;
}

function recordingDispatcher(
  impl: McpDispatcher['dispatch'],
  calls: RecordedCall[],
): McpDispatcher {
  return {
    dispatch(operation, args, options) {
      calls.push({ operation, args, options });
      return impl(operation, args, options);
    },
  };
}

async function connectPair(dispatcher: McpDispatcher) {
  const server = new Server(
    { name: 'never-rest-mcp-test', version: '0.0.0' },
    { capabilities: { tools: {} } },
  );
  registerContract(server, dispatcher, { contract });

  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return { client, server };
}

describe('registerContract', () => {
  const writes: string[] = [];
  const stdoutWrite = process.stdout.write.bind(process.stdout);

  afterEach(() => {
    process.stdout.write = stdoutWrite;
    writes.length = 0;
  });

  function captureStdout() {
    process.stdout.write = ((chunk: unknown, ...rest: unknown[]) => {
      writes.push(String(chunk));
      return stdoutWrite(chunk as never, ...(rest as []));
    }) as typeof process.stdout.write;
  }

  it('calls an operation through the in-memory MCP transport', async () => {
    const dispatcher = createDispatcher(contract, {
      getItem: ({ params }) => ok({ id: params.id, title: `Item ${params.id}` }),
    });
    const { client } = await connectPair(dispatcher);

    const result = await client.callTool({
      name: 'getItem',
      arguments: { id: 'a' },
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ id: 'a', title: 'Item a' });
  });

  it('rejects an extra tool argument', async () => {
    const calls: RecordedCall[] = [];
    const dispatcher = recordingDispatcher(() => {
      throw new Error('dispatcher should not run');
    }, calls);
    const { client } = await connectPair(dispatcher);

    const result = await client.callTool({
      name: 'getItem',
      arguments: { id: 'a', extra: 'nope' },
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: 'validation_error' });
    expect(calls).toEqual([]);
  });

  it('forwards principal and abort signal to dispatch', async () => {
    const calls: RecordedCall[] = [];
    const inner = createDispatcher(contract, {
      getItem: ({ params }) => ok({ id: params.id, title: 'ok' }),
    });
    const dispatcher = recordingDispatcher((operation, args, options) => {
      return inner.dispatch(operation, args, options);
    }, calls);

    const server = new Server(
      { name: 'never-rest-mcp-test', version: '0.0.0' },
      { capabilities: { tools: {} } },
    );
    registerContract(server, dispatcher, {
      contract,
      resolvePrincipal: () => ({ project: 'alpha' }),
    });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    await client.callTool({ name: 'getItem', arguments: { id: 'a' } });

    expect(calls[0]?.options?.principal).toEqual({ project: 'alpha' });
    expect(calls[0]?.options?.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns a disclosed RailError as an MCP tool error', async () => {
    const dispatcher: McpDispatcher = {
      dispatch: () => err(boundaryError('boundary.forbidden')),
    };
    const { client } = await connectPair(dispatcher);

    const result = await client.callTool({
      name: 'getItem',
      arguments: { id: 'a' },
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      code: 'boundary.forbidden',
    });
  });

  it('calling a tool that is not in the contract', async () => {
    const dispatcher = createDispatcher(contract, {
      getItem: ({ params }) => ok({ id: params.id, title: 'ok' }),
    });
    const { client } = await connectPair(dispatcher);

    const result = await client.callTool({
      name: 'missing',
      arguments: {},
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      code: 'route_not_found',
    });
  });

  it('listing and calling tools without writing stdout', async () => {
    captureStdout();
    const dispatcher = createDispatcher(contract, {
      getItem: ({ params }) => ok({ id: params.id, title: 'ok' }),
    });
    const { client } = await connectPair(dispatcher);

    await client.listTools();
    await client.callTool({ name: 'getItem', arguments: { id: 'a' } });

    expect(writes.join('')).toBe('');
  });

  it('does not treat a domain nextStep as adapter output', async () => {
    const dispatcher: McpDispatcher = {
      dispatch: () =>
        err(
          railError('not_found', 'Missing', {
            nextStep: 'Try another id',
          }),
        ),
    };
    const { client } = await connectPair(dispatcher);
    const result = await client.callTool({
      name: 'getItem',
      arguments: { id: 'a' },
    });
    expect(result.structuredContent).toMatchObject({
      code: 'not_found',
      nextStep: 'Try another id',
    });
  });
});
