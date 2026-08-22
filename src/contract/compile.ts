import { compilePath, matchPath, normalizePath, type CompiledPath } from './path.js';
import type { ContractDef, RouteDef } from './types.js';

export const RESERVED_ERROR_CODES = [
  'validation_error',
  'internal',
  'unavailable',
  'route_not_found',
] as const;

type ReservedErrorCode = (typeof RESERVED_ERROR_CODES)[number];

const reservedErrorCodeSet = new Set<string>(RESERVED_ERROR_CODES);

const ALLOWED_SUCCESS_STATUSES = [200, 201, 202, 204] as const;

function isReservedErrorCode(code: string): code is ReservedErrorCode {
  return reservedErrorCodeSet.has(code);
}

function isValidErrorStatus(status: number): boolean {
  return Number.isInteger(status) && status >= 400 && status <= 599;
}

function validateSuccessAndOutput(operation: string, route: RouteDef): void {
  const success = route.success ?? 200;

  if (
    !(ALLOWED_SUCCESS_STATUSES as readonly number[]).includes(success)
  ) {
    throw new ContractConfigurationError(
      `Operation "${operation}" declares invalid success status ${success}; allowed values are 200, 201, 202, and 204`,
    );
  }

  if (success === 204) {
    if (route.output !== undefined) {
      throw new ContractConfigurationError(
        `Operation "${operation}" with success 204 must not declare an output schema`,
      );
    }
    return;
  }

  if (route.output === undefined) {
    throw new ContractConfigurationError(
      `Operation "${operation}" must declare an output schema when success is not 204`,
    );
  }
}

function validateErrorMap(operation: string, errors: RouteDef['errors']): void {
  for (const [code, status] of Object.entries(errors)) {
    if (isReservedErrorCode(code)) {
      throw new ContractConfigurationError(
        `Reserved error code "${code}" cannot be used as a domain code on operation "${operation}"`,
      );
    }
    if (!isValidErrorStatus(status)) {
      throw new ContractConfigurationError(
        `Invalid error status ${status} for code "${code}" on operation "${operation}"; statuses must be integers from 400 to 599`,
      );
    }
  }
}

/** Thrown when a contract fails construction-time validation. */
export class ContractConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractConfigurationError';
  }
}

export interface CompiledRouteEntry<TRoute extends RouteDef = RouteDef> {
  readonly route: TRoute;
  readonly compiledPath: CompiledPath;
}

export interface CompiledContract<TContract extends ContractDef> {
  readonly contract: TContract;
  readonly domainErrorCodes: {
    readonly [K in keyof TContract]: readonly (keyof TContract[K]['errors'] & string)[];
  };
  readonly routes: {
    readonly [K in keyof TContract]: CompiledRouteEntry<TContract[K]>;
  };
}

/**
 * True when `pathname` matches any compiled route, regardless of method.
 * `invalid_encoding` counts as a match so the host still dispatches to `serve`.
 */
export function isContractPath(
  compiled: CompiledContract<ContractDef>,
  pathname: string,
): boolean {
  for (const entry of Object.values(compiled.routes)) {
    const pathMatch = matchPath(entry.compiledPath, pathname);
    if (pathMatch.kind !== 'miss') {
      return true;
    }
  }
  return false;
}

/** Ensure every compiled operation key maps to a handler function. */
export function assertHandlersComplete(
  compiled: CompiledContract<never>,
  handlers: object,
): void {
  const handlerMap = handlers as Record<string, unknown>;
  for (const operation of Object.keys(compiled.routes)) {
    const handler = handlerMap[operation];
    if (typeof handler !== 'function') {
      throw new ContractConfigurationError(
        `Missing handler for operation "${operation}"`,
      );
    }
  }
}

function rejectDuplicate(
  seen: Map<string, string>,
  key: string,
  operation: string,
  message: string,
): void {
  const duplicate = seen.get(key);
  if (duplicate !== undefined) {
    throw new ContractConfigurationError(message);
  }
  seen.set(key, operation);
}

function compilePathOrThrow(operation: string, path: string): CompiledPath {
  try {
    return compilePath(path);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ContractConfigurationError(
      `Invalid path on operation "${operation}": ${detail}`,
    );
  }
}

function validateParamsSchema(
  operation: string,
  route: RouteDef,
  compiledPath: CompiledPath,
): void {
  const hasPathParams = compiledPath.paramNames.length > 0;
  if (hasPathParams && route.params === undefined) {
    throw new ContractConfigurationError(
      `Operation "${operation}" path has parameters but no params schema`,
    );
  }
  if (!hasPathParams && route.params !== undefined) {
    throw new ContractConfigurationError(
      `Operation "${operation}" declares params schema but path has no parameters`,
    );
  }
}

function validateBodyMethod(operation: string, route: RouteDef): void {
  if (
    route.body !== undefined &&
    (route.method === 'GET' || route.method === 'DELETE')
  ) {
    throw new ContractConfigurationError(
      `Operation "${operation}" cannot declare body on ${route.method}`,
    );
  }
}

/** Validate and precompile a contract for client and server construction. */
export function compileContract<TContract extends ContractDef>(
  contract: TContract,
): CompiledContract<TContract> {
  const routeEntries: Record<string, CompiledRouteEntry> = {};
  const domainCodes: Record<string, readonly string[]> = {};
  const seenMethodPath = new Map<string, string>();
  const seenNormalizedPath = new Map<string, string>();
  const seenMatchers = new Map<string, string>();

  for (const [operation, route] of Object.entries(contract)) {
    rejectDuplicate(
      seenMethodPath,
      `${route.method}:${route.path}`,
      operation,
      `Duplicate route ${route.method} ${route.path} on operations "${seenMethodPath.get(`${route.method}:${route.path}`)}" and "${operation}"`,
    );

    const normalizedPath = normalizePath(route.path);
    rejectDuplicate(
      seenNormalizedPath,
      `${route.method}:${normalizedPath}`,
      operation,
      `Duplicate route ${route.method} ${route.path} on operations "${seenNormalizedPath.get(`${route.method}:${normalizedPath}`)}" and "${operation}"`,
    );

    validateErrorMap(operation, route.errors);
    validateSuccessAndOutput(operation, route);

    const compiledPath = compilePathOrThrow(operation, route.path);
    validateParamsSchema(operation, route, compiledPath);
    validateBodyMethod(operation, route);

    rejectDuplicate(
      seenMatchers,
      `${route.method}:${compiledPath.regex.source}`,
      operation,
      `Duplicate route matcher ${route.method} ${route.path} on operations "${seenMatchers.get(`${route.method}:${compiledPath.regex.source}`)}" and "${operation}"`,
    );

    routeEntries[operation] = { route, compiledPath };
    domainCodes[operation] = Object.keys(route.errors);
  }

  return {
    contract,
    domainErrorCodes: domainCodes as CompiledContract<TContract>['domainErrorCodes'],
    routes: routeEntries as CompiledContract<TContract>['routes'],
  };
}
