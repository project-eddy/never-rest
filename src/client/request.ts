import { compilePath } from '../contract/path.js';
import type { RouteDef } from '../contract/types.js';

export interface BuiltRequest {
  readonly url: string;
  readonly init: RequestInit;
}

function interpolatePath(
  path: string,
  paramNames: readonly string[],
  pathParams: Record<string, string>,
): string {
  let result = path;
  for (const name of paramNames) {
    const value = pathParams[name];
    if (value !== undefined) {
      result = result.replace(`:${name}`, encodeURIComponent(value));
    }
  }
  return result;
}

function toQueryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query.length > 0 ? `?${query}` : '';
}

/** Split validated input into path params and the remainder for body or query. */
export function splitInput(
  paramNames: readonly string[],
  input: unknown,
): {
  readonly pathParams: Record<string, string>;
  readonly remainder: Record<string, unknown> | undefined;
} {
  if (paramNames.length === 0) {
    if (input === undefined) {
      return { pathParams: {}, remainder: undefined };
    }
    if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
      const record = input as Record<string, unknown>;
      return Object.keys(record).length > 0
        ? { pathParams: {}, remainder: record }
        : { pathParams: {}, remainder: undefined };
    }
    return { pathParams: {}, remainder: undefined };
  }

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { pathParams: {}, remainder: undefined };
  }

  const record = input as Record<string, unknown>;
  const pathParams: Record<string, string> = {};
  const remainder: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (paramNames.includes(key)) {
      if (value !== undefined && value !== null) {
        pathParams[key] = String(value);
      }
    } else {
      remainder[key] = value;
    }
  }

  return {
    pathParams,
    remainder: Object.keys(remainder).length > 0 ? remainder : undefined,
  };
}

/** Build a fetch URL and init from a route definition and validated input. */
export function buildRequest(
  route: RouteDef,
  baseUrl: string,
  input: unknown,
  headers: HeadersInit | undefined,
  credentials?: RequestCredentials,
): BuiltRequest {
  const compiled = compilePath(route.path);
  const { pathParams, remainder } = splitInput(compiled.paramNames, input);
  const pathname = interpolatePath(route.path, compiled.paramNames, pathParams);
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  const methodUsesQuery =
    route.method === 'GET' || route.method === 'DELETE';
  const query =
    methodUsesQuery && remainder !== undefined ? toQueryString(remainder) : '';
  const url = `${base}${pathname}${query}`;

  const init: RequestInit = { method: route.method, headers };
  if (credentials !== undefined) {
    init.credentials = credentials;
  }

  if (!methodUsesQuery && remainder !== undefined) {
    const mergedHeaders = new Headers(headers);
    if (!mergedHeaders.has('content-type')) {
      mergedHeaders.set('content-type', 'application/json');
    }
    init.headers = mergedHeaders;
    init.body = JSON.stringify(remainder);
  }

  return { url, init };
}
