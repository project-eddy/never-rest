import { err, ok, type Result } from 'neverthrow';

import type { CompiledPath } from '../contract/path.js';
import type { RouteDef } from '../contract/types.js';
import { railError, type RailError } from '../error.js';

export interface BuiltRequest {
  readonly url: string;
  readonly init: RequestInit;
}

type BuildRequestError = RailError<'validation_error' | 'internal'>;

function validationError(
  message: string,
  issues?: readonly { path: readonly (string | number)[]; message: string }[],
): RailError<'validation_error'> {
  return issues !== undefined
    ? railError('validation_error', message, { issues })
    : railError('validation_error', message);
}

function internalError(message: string): RailError<'internal'> {
  return railError('internal', message);
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

function isQueryPrimitive(value: unknown): value is string | number | boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function appendQueryValue(
  search: URLSearchParams,
  key: string,
  value: unknown,
): Result<void, RailError<'validation_error'>> {
  if (value === undefined || value === null) {
    return ok(undefined);
  }

  if (isQueryPrimitive(value)) {
    search.set(key, String(value));
    return ok(undefined);
  }

  if (value instanceof Date) {
    search.set(key, value.toISOString());
    return ok(undefined);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return err(
        validationError(
          `Query parameter "${key}" cannot be an empty array; omit the field or use POST`,
          [{ path: [key], message: 'Empty array is not representable in a query string' }],
        ),
      );
    }

    for (const item of value) {
      if (isQueryPrimitive(item)) {
        search.append(`${key}[]`, String(item));
      } else if (item instanceof Date) {
        search.append(`${key}[]`, item.toISOString());
      } else {
        return err(
          validationError(
            `Query parameter "${key}" has an unrepresentable value`,
            [{ path: [key], message: 'Nested objects, bigint, and nested arrays are not supported in query strings' }],
          ),
        );
      }
    }
    return ok(undefined);
  }

  return err(
    validationError(
      `Query parameter "${key}" has an unrepresentable value`,
      [{ path: [key], message: 'Nested objects, bigint, and nested arrays are not supported in query strings' }],
    ),
  );
}

function toQueryString(
  params: Record<string, unknown>,
): Result<string, RailError<'validation_error'>> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const appended = appendQueryValue(search, key, value);
    if (appended.isErr()) {
      return err(appended.error);
    }
  }
  const query = search.toString();
  return ok(query.length > 0 ? `?${query}` : '');
}

function pathParamValue(
  input: Record<string, unknown>,
  name: string,
): unknown {
  return input[name];
}

function validatePathParams(
  paramNames: readonly string[],
  input: unknown,
): Result<Record<string, string>, RailError<'validation_error'>> {
  if (paramNames.length === 0) {
    return ok({});
  }

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    const first = paramNames[0];
    return err(
      validationError(`Path parameter "${first}" is required`, [
        { path: [first], message: 'Path parameter is missing' },
      ]),
    );
  }

  const record = input as Record<string, unknown>;
  const pathParams: Record<string, string> = {};

  for (const name of paramNames) {
    const value = pathParamValue(record, name);
    if (value === undefined || value === null || value === '') {
      return err(
        validationError(`Path parameter "${name}" is required`, [
          { path: [name], message: 'Path parameter is missing, empty, or null' },
        ]),
      );
    }
    pathParams[name] = String(value);
  }

  return ok(pathParams);
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
      if (value !== undefined && value !== null && value !== '') {
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
  compiledPath: CompiledPath,
  baseUrl: string,
  input: unknown,
  headers: HeadersInit | undefined,
  credentials?: RequestCredentials,
): Result<BuiltRequest, BuildRequestError> {
  const pathParamsResult = validatePathParams(compiledPath.paramNames, input);
  if (pathParamsResult.isErr()) {
    return err(pathParamsResult.error);
  }

  const { remainder } = splitInput(compiledPath.paramNames, input);
  const pathname = interpolatePath(
    route.path,
    compiledPath.paramNames,
    pathParamsResult.value,
  );
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  const methodUsesQuery =
    route.method === 'GET' || route.method === 'DELETE';
  let query = '';
  if (methodUsesQuery && remainder !== undefined) {
    const queryResult = toQueryString(remainder);
    if (queryResult.isErr()) {
      return err(queryResult.error);
    }
    query = queryResult.value;
  }
  const url = `${base}${pathname}${query}`;

  let mergedHeaders: Headers;
  try {
    mergedHeaders = new Headers(headers);
  } catch {
    return err(internalError('Request headers are invalid'));
  }

  const init: RequestInit = { method: route.method, headers: mergedHeaders };
  if (credentials !== undefined) {
    init.credentials = credentials;
  }

  if (!methodUsesQuery && remainder !== undefined) {
    if (!mergedHeaders.has('content-type')) {
      mergedHeaders.set('content-type', 'application/json');
    }
    try {
      init.body = JSON.stringify(remainder);
    } catch {
      return err(internalError('Request body cannot be serialized'));
    }
  }

  return ok({ url, init });
}
