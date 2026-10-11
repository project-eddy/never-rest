import { ContractConfigurationError } from '../contract/compile.js';
import type { RouteDef } from '../contract/types.js';
import { railError, type RailError } from '../error.js';
import type { InputSourceKey } from './types.js';

const INPUT_SOURCE_KEYS: readonly InputSourceKey[] = [
  'params',
  'query',
  'body',
  'headers',
];

/** Input sources declared on a route, in a stable order. */
export function declaredInputSources(
  route: RouteDef,
): readonly InputSourceKey[] {
  return INPUT_SOURCE_KEYS.filter((key) => route[key] !== undefined);
}

/** The single MCP-legal input source, or undefined when the tool takes none. */
export function singleInputSource(
  operation: string,
  route: RouteDef,
): InputSourceKey | undefined {
  const sources = declaredInputSources(route);
  if (sources.length > 1) {
    throw new ContractConfigurationError(
      `Operation "${operation}" cannot be exposed as an MCP tool: declare exactly one of params, query, body, or headers`,
    );
  }
  return sources[0];
}

/** Wrap flat MCP arguments back into the contract source object. */
export function wrapToolArguments(
  source: InputSourceKey | undefined,
  args: unknown,
): Record<string, unknown> {
  if (source === undefined) {
    return {};
  }
  return { [source]: args };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Top-level property names from a JSON Schema object, if present. */
export function objectPropertyNames(
  schema: Record<string, unknown>,
): readonly string[] | undefined {
  if (!isPlainObject(schema.properties)) {
    return undefined;
  }
  return Object.keys(schema.properties);
}

/** Keys on `args` that are not in the tool schema. */
export function unknownArgumentKeys(
  args: unknown,
  allowed: readonly string[],
): readonly string[] {
  if (!isPlainObject(args)) {
    return [];
  }
  return Object.keys(args).filter((key) => !allowed.includes(key));
}

/** Reject extra MCP arguments before dispatch. */
export function unknownKeysError(
  keys: readonly string[],
): RailError<'validation_error'> | undefined {
  if (keys.length === 0) {
    return undefined;
  }
  return railError('validation_error', 'Unknown tool arguments', {
    issues: keys.map((key) => ({
      path: [key],
      message: 'Unknown argument',
    })),
  });
}
