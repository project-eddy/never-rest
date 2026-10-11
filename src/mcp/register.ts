import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

import type { ContractDef } from '../contract/types.js';
import { railError, type RailError } from '../error.js';
import {
  objectPropertyNames,
  singleInputSource,
  unknownArgumentKeys,
  unknownKeysError,
  wrapToolArguments,
} from './input-source.js';
import { toMcpTools } from './tools.js';
import type {
  InputSourceKey,
  McpDispatcher,
  McpRequestExtra,
  RegisterContractOptions,
} from './types.js';

function protocolServer(target: Server | { readonly server: Server }): Server {
  if ('server' in target) {
    return target.server;
  }
  return target;
}

function asStructured(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

function successResult(value: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: asStructured(value),
  };
}

function errorResult(error: RailError<string>): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(error) }],
    structuredContent: asStructured(error),
  };
}

function missingToolError(name: string): RailError<'route_not_found'> {
  return railError('route_not_found', `No operation "${name}" in this contract`);
}

function sourceByOperation(
  contract: ContractDef,
): Readonly<Record<string, InputSourceKey | undefined>> {
  const sources: Record<string, InputSourceKey | undefined> = {};
  for (const [operation, route] of Object.entries(contract)) {
    sources[operation] = singleInputSource(operation, route);
  }
  return sources;
}

async function resolveCallOptions(
  extra: McpRequestExtra,
  options: RegisterContractOptions<ContractDef>,
): Promise<{ readonly principal: unknown; readonly context: unknown }> {
  const principal = options.resolvePrincipal
    ? await options.resolvePrincipal(extra)
    : undefined;
  const context = options.resolveContext
    ? await options.resolveContext(extra)
    : undefined;
  return { principal, context };
}

interface PreparedCall {
  readonly name: string;
  readonly args: unknown;
  readonly extra: McpRequestExtra;
}

function prepareDispatchArgs(
  source: InputSourceKey | undefined,
  inputSchema: Record<string, unknown>,
  args: unknown,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: RailError<string> } {
  const allowed = objectPropertyNames(inputSchema) ?? [];
  const unknown = unknownKeysError(unknownArgumentKeys(args, allowed));
  if (unknown !== undefined) {
    return { ok: false, error: unknown };
  }
  return { ok: true, value: wrapToolArguments(source, args) };
}

async function dispatchPrepared(
  dispatcher: McpDispatcher,
  name: string,
  value: unknown,
  extra: McpRequestExtra,
  options: RegisterContractOptions<ContractDef>,
): Promise<CallToolResult> {
  const call = await resolveCallOptions(extra, options);
  const result = await dispatcher.dispatch(name, value, {
    principal: call.principal,
    context: call.context,
    signal: extra.signal,
  });
  if (result.isErr()) {
    return errorResult(result.error);
  }
  return successResult(result.value);
}

async function handleToolCall(
  dispatcher: McpDispatcher,
  contract: ContractDef,
  sources: Readonly<Record<string, InputSourceKey | undefined>>,
  tools: ReturnType<typeof toMcpTools>,
  prepared: PreparedCall,
  options: RegisterContractOptions<ContractDef>,
): Promise<CallToolResult> {
  const route = contract[prepared.name];
  if (route === undefined) {
    return errorResult(missingToolError(prepared.name));
  }
  const tool = tools.find((entry) => entry.name === prepared.name);
  const inputSchema = tool?.inputSchema ?? { properties: {} };
  const preparedArgs = prepareDispatchArgs(
    sources[prepared.name],
    inputSchema,
    prepared.args,
  );
  if (!preparedArgs.ok) {
    return errorResult(preparedArgs.error);
  }
  return dispatchPrepared(
    dispatcher,
    prepared.name,
    preparedArgs.value,
    prepared.extra,
    options,
  );
}

/**
 * Register list/call handlers on an MCP server.
 * Authorization stays on the dispatcher (definePolicy).
 */
export function registerContract<TContract extends ContractDef>(
  target: Server | { readonly server: Server },
  dispatcher: McpDispatcher,
  options: RegisterContractOptions<TContract>,
): void {
  const tools = toMcpTools(options.contract);
  const sources = sourceByOperation(options.contract);
  const server = protocolServer(target);

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    return handleToolCall(
      dispatcher,
      options.contract,
      sources,
      tools,
      {
        name: request.params.name,
        args: request.params.arguments ?? {},
        extra,
      },
      options,
    );
  });
}
