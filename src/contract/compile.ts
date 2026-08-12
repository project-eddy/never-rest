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

function isReservedErrorCode(code: string): code is ReservedErrorCode {
  return reservedErrorCodeSet.has(code);
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
    readonly [K in keyof TContract]: readonly TContract[K]['errors'][number][];
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
    const methodPath = `${route.method}:${route.path}`;
    const duplicate = seenMethodPath.get(methodPath);
    if (duplicate !== undefined) {
      throw new ContractConfigurationError(
        `Duplicate route ${route.method} ${route.path} on operations "${duplicate}" and "${operation}"`,
      );
    }
    seenMethodPath.set(methodPath, operation);

    const normalizedPath = normalizePath(route.path);
    const methodNormalized = `${route.method}:${normalizedPath}`;
    const normalizedDuplicate = seenNormalizedPath.get(methodNormalized);
    if (normalizedDuplicate !== undefined) {
      throw new ContractConfigurationError(
        `Duplicate route ${route.method} ${route.path} on operations "${normalizedDuplicate}" and "${operation}"`,
      );
    }
    seenNormalizedPath.set(methodNormalized, operation);

    const seenCodes = new Set<string>();
    for (const code of route.errors) {
      if (seenCodes.has(code)) {
        throw new ContractConfigurationError(
          `Duplicate error code "${code}" on operation "${operation}"`,
        );
      }
      seenCodes.add(code);
      if (isReservedErrorCode(code)) {
        throw new ContractConfigurationError(
          `Reserved error code "${code}" cannot be used as a domain code on operation "${operation}"`,
        );
      }
    }

    let compiledPath: CompiledPath;
    try {
      compiledPath = compilePath(route.path);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ContractConfigurationError(
        `Invalid path on operation "${operation}": ${detail}`,
      );
    }

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

    if (
      route.body !== undefined &&
      (route.method === 'GET' || route.method === 'DELETE')
    ) {
      throw new ContractConfigurationError(
        `Operation "${operation}" cannot declare body on ${route.method}`,
      );
    }

    const matcherKey = `${route.method}:${compiledPath.regex.source}`;
    const matcherDuplicate = seenMatchers.get(matcherKey);
    if (matcherDuplicate !== undefined) {
      throw new ContractConfigurationError(
        `Duplicate route matcher ${route.method} ${route.path} on operations "${matcherDuplicate}" and "${operation}"`,
      );
    }
    seenMatchers.set(matcherKey, operation);

    routeEntries[operation] = { route, compiledPath };
    domainCodes[operation] = route.errors;
  }

  return {
    contract,
    domainErrorCodes: domainCodes as CompiledContract<TContract>['domainErrorCodes'],
    routes: routeEntries as CompiledContract<TContract>['routes'],
  };
}
