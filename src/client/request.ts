import { err, ok, type Result } from 'neverthrow';

import type { CompiledPath } from '../contract/path.js';
import type { ClientArgsOf, RouteDef } from '../contract/types.js';
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
): Result<string, RailError<'validation_error'>> {
  let result = path;
  for (const name of paramNames) {
    const value = pathParams[name];
    if (value === undefined || value === '') {
      return err(
        validationError(`Path parameter "${name}" is required`, [
          { path: ['params', name], message: 'Path parameter is missing, empty, or null' },
        ]),
      );
    }
    result = result.replace(`:${name}`, encodeURIComponent(value));
  }
  return ok(result);
}

function isQueryPrimitive(value: unknown): value is string | number | boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function appendArrayQuery(
  search: URLSearchParams,
  key: string,
  value: readonly unknown[],
): Result<void, RailError<'validation_error'>> {
  if (value.length === 0) {
    return err(
      validationError(
        `Query parameter "${key}" cannot be an empty array; omit the field or use POST`,
        [
          {
            path: ['query', key],
            message: 'Empty array is not representable in a query string',
          },
        ],
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
        validationError(`Query parameter "${key}" has an unrepresentable value`, [
          {
            path: ['query', key],
            message:
              'Nested objects, bigint, and nested arrays are not supported in query strings',
          },
        ]),
      );
    }
  }
  return ok(undefined);
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
    return appendArrayQuery(search, key, value);
  }

  return err(
    validationError(`Query parameter "${key}" has an unrepresentable value`, [
      {
        path: ['query', key],
        message:
          'Nested objects, bigint, and nested arrays are not supported in query strings',
      },
    ]),
  );
}

function toQueryString(
  query: Record<string, unknown>,
): Result<string, RailError<'validation_error'>> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    const appended = appendQueryValue(search, key, value);
    if (appended.isErr()) {
      return err(appended.error);
    }
  }
  const encoded = search.toString();
  return ok(encoded.length > 0 ? `?${encoded}` : '');
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function pathParamsFromArgs(
  paramNames: readonly string[],
  args: ClientArgsOf<RouteDef>,
): Result<Record<string, string>, RailError<'validation_error'>> {
  if (paramNames.length === 0) {
    return ok({});
  }

  const paramsBag = asRecord(
    (args as { readonly params?: unknown }).params,
  );
  if (paramsBag === undefined) {
    const first = paramNames[0]!;
    return err(
      validationError(`Path parameter "${first}" is required`, [
        { path: ['params', first], message: 'Path parameter is missing' },
      ]),
    );
  }

  const pathParams: Record<string, string> = {};
  for (const name of paramNames) {
    const value = paramsBag[name];
    if (value === undefined || value === null || value === '') {
      return err(
        validationError(`Path parameter "${name}" is required`, [
          {
            path: ['params', name],
            message: 'Path parameter is missing, empty, or null',
          },
        ]),
      );
    }
    pathParams[name] = String(value);
  }

  return ok(pathParams);
}

function querySuffix(
  args: ClientArgsOf<RouteDef>,
): Result<string, RailError<'validation_error'>> {
  const queryValue = (args as { readonly query?: unknown }).query;
  if (queryValue === undefined) {
    return ok('');
  }
  const queryRecord = asRecord(queryValue);
  if (queryRecord === undefined) {
    return err(
      validationError('Query must be an object', [
        { path: ['query'], message: 'Query must be an object' },
      ]),
    );
  }
  return toQueryString(queryRecord);
}

function applyJsonBody(
  init: RequestInit,
  headers: Headers,
  bodyValue: unknown,
): Result<void, RailError<'internal'>> {
  if (bodyValue === undefined) {
    return ok(undefined);
  }
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  try {
    init.body = JSON.stringify(bodyValue);
    return ok(undefined);
  } catch {
    return err(internalError('Request body cannot be serialized'));
  }
}

function mergeRequestHeaders(
  headers: HeadersInit | undefined,
): Result<Headers, RailError<'internal'>> {
  try {
    return ok(new Headers(headers));
  } catch {
    return err(internalError('Request headers are invalid'));
  }
}

function requestUrl(
  baseUrl: string,
  pathname: string,
  query: string,
): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}${pathname}${query}`;
}

/** Build a fetch URL and init from declared params / query / body sources. */
export function buildRequest(
  route: RouteDef,
  compiledPath: CompiledPath,
  baseUrl: string,
  args: ClientArgsOf<RouteDef>,
  headers: HeadersInit | undefined,
  credentials?: RequestCredentials,
): Result<BuiltRequest, BuildRequestError> {
  const pathParamsResult = pathParamsFromArgs(compiledPath.paramNames, args);
  if (pathParamsResult.isErr()) {
    return err(pathParamsResult.error);
  }

  const pathnameResult = interpolatePath(
    route.path,
    compiledPath.paramNames,
    pathParamsResult.value,
  );
  if (pathnameResult.isErr()) {
    return err(pathnameResult.error);
  }

  const queryResult = querySuffix(args);
  if (queryResult.isErr()) {
    return err(queryResult.error);
  }

  const url = requestUrl(baseUrl, pathnameResult.value, queryResult.value);

  const headersResult = mergeRequestHeaders(headers);
  if (headersResult.isErr()) {
    return err(headersResult.error);
  }
  const mergedHeaders = headersResult.value;

  const init: RequestInit = { method: route.method, headers: mergedHeaders };
  if (credentials !== undefined) {
    init.credentials = credentials;
  }

  const bodyResult = applyJsonBody(
    init,
    mergedHeaders,
    (args as { readonly body?: unknown }).body,
  );
  if (bodyResult.isErr()) {
    return err(bodyResult.error);
  }

  return ok({ url, init });
}
