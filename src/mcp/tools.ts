import { ContractConfigurationError } from '../contract/compile.js';
import type { ContractDef, RouteDef } from '../contract/types.js';
import { convertStandardSchema } from '../openapi/schema.js';
import { singleInputSource } from './input-source.js';
import type { InputSourceKey, McpToolDefinition } from './types.js';

function emptyInputSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {},
    additionalProperties: false,
  };
}

function closeObjectSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  if (schema.additionalProperties !== undefined) {
    return schema;
  }
  return { ...schema, additionalProperties: false };
}

function convertSourceSchema(
  operation: string,
  source: InputSourceKey,
  route: RouteDef,
): Record<string, unknown> {
  const schema = route[source];
  if (schema === undefined) {
    throw new ContractConfigurationError(
      `Operation "${operation}" is missing the ${source} schema`,
    );
  }
  try {
    return convertStandardSchema(operation, source, schema, 'input');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ContractConfigurationError(detail);
  }
}

function toolInputSchema(
  operation: string,
  route: RouteDef,
  source: InputSourceKey | undefined,
): Record<string, unknown> {
  if (source === undefined) {
    return emptyInputSchema();
  }
  return closeObjectSchema(convertSourceSchema(operation, source, route));
}

function readOnlyAnnotations(method: RouteDef['method']) {
  if (method !== 'GET') {
    return undefined;
  }
  return { readOnlyHint: true as const };
}

/** Project one route to an MCP tool definition. */
export function toMcpTool(
  operation: string,
  route: RouteDef,
): McpToolDefinition {
  const source = singleInputSource(operation, route);
  return {
    name: operation,
    description: route.summary ?? operation,
    inputSchema: toolInputSchema(operation, route, source),
    annotations: readOnlyAnnotations(route.method),
  };
}

/**
 * Project a contract to MCP tool definitions.
 * Each operation must declare zero or one input source.
 */
export function toMcpTools(
  contract: ContractDef,
): readonly McpToolDefinition[] {
  return Object.entries(contract).map(([operation, route]) =>
    toMcpTool(operation, route),
  );
}
