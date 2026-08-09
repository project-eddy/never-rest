import { compilePath, matchPath, type CompiledPath } from '../contract/path.js';
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
  return Object.entries(contract).map(([key, route]) => ({
    key,
    route,
    compiledPath: compilePath(route.path),
  }));
}

/**
 * Match method and pathname against compiled routes in declaration order.
 * Returns the first match or undefined when nothing matches.
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
    const params = matchPath(entry.compiledPath, pathname);
    if (params !== undefined) {
      return { key: entry.key, route: entry.route, params };
    }
  }
  return undefined;
}
