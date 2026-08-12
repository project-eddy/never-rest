import { compileContract } from '../contract/compile.js';
import { matchPath, type CompiledPath } from '../contract/path.js';
import type { ContractDef, RouteDef } from '../contract/types.js';

export interface CompiledRoute {
  readonly key: string;
  readonly route: RouteDef;
  readonly compiledPath: CompiledPath;
}

export interface RouteMatch {
  readonly key: string;
  readonly route: RouteDef;
  readonly params: Record<string, string>;
}

/** Precompile every contract route for path matching. */
export function compileRoutes(contract: ContractDef): readonly CompiledRoute[] {
  const compiled = compileContract(contract);
  return Object.entries(compiled.routes).map(([key, entry]) => ({
    key,
    route: entry.route,
    compiledPath: entry.compiledPath,
  }));
}

/**
 * Match method and pathname against compiled routes in declaration order.
 * Returns the first match or undefined when nothing matches.
 *
 * Path captures that fail percent-decoding are treated as non-matches;
 * use `matchPath` when the caller must distinguish `invalid_encoding`.
 */
export function matchRoute(
  routes: readonly CompiledRoute[],
  method: string,
  pathname: string,
): RouteMatch | undefined {
  for (const entry of routes) {
    if (entry.route.method !== method) {
      continue;
    }
    const pathMatch = matchPath(entry.compiledPath, pathname);
    if (pathMatch.kind === 'match') {
      return {
        key: entry.key,
        route: entry.route,
        params: pathMatch.params,
      };
    }
  }
  return undefined;
}
