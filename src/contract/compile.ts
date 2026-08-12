import { compilePath, type CompiledPath } from './path.js';
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

/** Validate and precompile a contract for client and server construction. */
export function compileContract<TContract extends ContractDef>(
  contract: TContract,
): CompiledContract<TContract> {
  const routeEntries: Record<string, CompiledRouteEntry> = {};
  const domainCodes: Record<string, readonly string[]> = {};
  const seenMethodPath = new Map<string, string>();

  for (const [operation, route] of Object.entries(contract)) {
    const methodPath = `${route.method}:${route.path}`;
    const duplicate = seenMethodPath.get(methodPath);
    if (duplicate !== undefined) {
      throw new ContractConfigurationError(
        `Duplicate route ${route.method} ${route.path} on operations "${duplicate}" and "${operation}"`,
      );
    }
    seenMethodPath.set(methodPath, operation);

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

    routeEntries[operation] = { route, compiledPath };
    domainCodes[operation] = route.errors;
  }

  return {
    contract,
    domainErrorCodes: domainCodes as CompiledContract<TContract>['domainErrorCodes'],
    routes: routeEntries as CompiledContract<TContract>['routes'],
  };
}
