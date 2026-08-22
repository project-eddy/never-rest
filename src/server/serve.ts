import { err, ok, type Result, ResultAsync } from 'neverthrow';

import {
  assertHandlersComplete,
  compileContract,
  isContractPath,
  type CompiledContract,
} from '../contract/compile.js';
import { matchPath, normalizePath } from '../contract/path.js';
import { parseOutput, parseRouteSources } from '../contract/parse.js';
import type {
  ContractDef,
  HandlerArgsOf,
  OutputOf,
  RouteDef,
} from '../contract/types.js';
import type { Disclosure } from '../disclose.js';
import { MAX_CAUSE_DEPTH, railError, type RailError } from '../error.js';
import { respond } from '../respond.js';
import {
  HOST_STATUSES,
  type HostStatuses,
  type StatusMap,
} from '../status.js';
import type { CompiledRoute } from './router.js';
import type { ServeHandler, ServeOptions } from './types.js';

export type Handler<TRoute extends RouteDef, TContext> = (
  args: HandlerArgsOf<TRoute> & {
    request: Request;
    context: TContext;
  },
) =>
  | Result<OutputOf<TRoute>, RailError<keyof TRoute['errors'] & string>>
  | ResultAsync<OutputOf<TRoute>, RailError<keyof TRoute['errors'] & string>>
  | Promise<
      Result<OutputOf<TRoute>, RailError<keyof TRoute['errors'] & string>>
    >;

export type Handlers<TContract extends ContractDef, TContext> = {
  readonly [K in keyof TContract]: Handler<TContract[K], TContext>;
};

const FAILSAFE_INTERNAL_BODY =
  '{"code":"internal","message":"An unexpected error occurred"}';

const HOST_ONLY_ROUTE: RouteDef = {
  method: 'GET',
  path: '/',
  errors: {},
};

type RouteRequestMatch =
  | {
      readonly kind: 'match';
      readonly key: string;
      readonly route: RouteDef;
      readonly params: Record<string, string>;
    }
  | { readonly kind: 'route_not_found' }
  | { readonly kind: 'invalid_encoding'; readonly param: string };

type PathScope =
  | { readonly kind: 'outside_base' }
  | { readonly kind: 'scoped'; readonly pathname: string };

type ProcessResult =
  | { readonly kind: 'unmatched' }
  | { readonly response: Response };

function mergeHostStatuses(
  overrides: Partial<HostStatuses> | undefined,
): HostStatuses {
  return { ...HOST_STATUSES, ...overrides };
}

function statusMapForRoute(
  route: RouteDef,
  hostStatuses: HostStatuses,
): StatusMap<string> {
  return { ...route.errors, ...hostStatuses };
}

function declaredStatusesForRoute(
  route: RouteDef,
  hostStatuses: HostStatuses,
): number[] {
  const declared = new Set<number>([route.success ?? 200]);
  for (const status of Object.values(route.errors)) {
    declared.add(status);
  }
  if (
    route.params !== undefined ||
    route.query !== undefined ||
    route.body !== undefined ||
    route.headers !== undefined
  ) {
    declared.add(hostStatuses.validation_error);
  }
  declared.add(hostStatuses.internal);
  return [...declared];
}

function isThrownInternal(error: RailError): boolean {
  return (
    error.code === 'internal' &&
    error.message === 'An unexpected error occurred' &&
    error.cause?.code === 'internal'
  );
}

function withoutCause(error: RailError, origin: string): RailError {
  const { cause: _cause, ...rest } = error;
  return { ...rest, origin: error.origin ?? origin };
}

function stampCause(
  stamped: RailError,
  cause: RailError,
  origin: string,
  depth: number,
  seen: WeakSet<RailError>,
): RailError {
  if (seen.has(cause) || depth + 1 > MAX_CAUSE_DEPTH) {
    const { cause: _cause, ...rest } = stamped;
    return rest;
  }
  return {
    ...stamped,
    cause: stampOrigin(cause, origin, depth + 1, seen),
  };
}

function stampOrigin(
  error: RailError,
  origin: string | undefined,
  depth = 0,
  seen = new WeakSet<RailError>(),
): RailError {
  if (origin === undefined) {
    return error;
  }
  if (depth > MAX_CAUSE_DEPTH || seen.has(error)) {
    return withoutCause(error, origin);
  }
  seen.add(error);
  const stamped: RailError = {
    ...error,
    origin: error.origin ?? origin,
  };
  if (error.cause === undefined) {
    return stamped;
  }
  return stampCause(stamped, error.cause, origin, depth, seen);
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

function searchParamsToObject(url: URL): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const [key, value] of url.searchParams.entries()) {
    if (key.endsWith('[]')) {
      const name = key.slice(0, -2);
      const existing = values[name];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        values[name] = [value];
      }
      continue;
    }
    values[key] = value;
  }

  return values;
}

async function readRequestBody(
  request: Request,
): Promise<Result<unknown, RailError<'validation_error'>>> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return err(
      railError('validation_error', 'Validation failed', {
        issues: [{ path: ['body'], message: 'Could not read request body' }],
      }),
    );
  }
  if (text.length === 0) {
    return ok(undefined);
  }
  try {
    return ok(JSON.parse(text) as unknown);
  } catch {
    return err(
      railError('validation_error', 'Validation failed', {
        issues: [{ path: ['body'], message: 'Invalid JSON body' }],
      }),
    );
  }
}

function internalFromThrown(thrown: unknown): RailError<'internal'> {
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  return railError('internal', 'An unexpected error occurred', {
    cause: railError('internal', message),
  });
}

function normalizeHandlerError(
  error: RailError<string>,
  declaredCodes: readonly string[],
): RailError<string> {
  if (declaredCodes.includes(error.code)) {
    return error;
  }
  return railError('internal', 'An unexpected error occurred', {
    cause: railError(
      'undeclared_handler_error',
      'Handler returned an undeclared error code',
      { cause: error },
    ),
  });
}

function resolveDisclosure(
  disclosure: Disclosure | ((request: Request) => Disclosure) | undefined,
  request: Request,
): Disclosure {
  try {
    if (typeof disclosure === 'function') {
      return disclosure(request);
    }
    return disclosure ?? 'public';
  } catch {
    return 'public';
  }
}

function failsafeInternalResponse(status: number): Response {
  return new Response(FAILSAFE_INTERNAL_BODY, {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

function jsonResponse(
  status: number,
  body: unknown,
  fallbackStatus: number,
): Response {
  try {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    return failsafeInternalResponse(fallbackStatus);
  }
}

function successResponse(
  status: number,
  body: unknown,
  fallbackStatus: number,
): Response {
  if (status === 204) {
    return emptyResponse(status);
  }
  return jsonResponse(status, body, fallbackStatus);
}

function respondWithError(
  error: RailError<string>,
  options: ServeOptions,
  route: RouteDef,
  hostStatuses: HostStatuses,
  declared: readonly number[],
  disclosure: Disclosure,
): Response {
  const stamped = stampOrigin(error, options.origin);
  const statuses = statusMapForRoute(route, hostStatuses);
  const response = respond(err(stamped), {
    success: route.success ?? 200,
    statuses,
    declared,
    disclosure,
  });
  return jsonResponse(
    response.status,
    response.body,
    hostStatuses.internal,
  );
}

function routeNotFoundResponse(
  options: ServeOptions,
  hostStatuses: HostStatuses,
  disclosure: Disclosure,
): Response {
  const statuses = statusMapForRoute(HOST_ONLY_ROUTE, hostStatuses);
  const response = respond(err(railError('route_not_found', 'Not found')), {
    success: 200,
    statuses,
    declared: [hostStatuses.route_not_found],
    disclosure,
  });
  return jsonResponse(
    response.status,
    response.body,
    hostStatuses.internal,
  );
}

async function invokeHandler<TContext>(
  handler: Handler<RouteDef, TContext>,
  args: HandlerArgsOf<RouteDef> & {
    request: Request;
    context: TContext;
  },
): Promise<Result<unknown, RailError<string>>> {
  try {
    return await handler(args);
  } catch (thrown) {
    return err(internalFromThrown(thrown));
  }
}

function matchRequest(
  routes: readonly CompiledRoute[],
  method: string,
  pathname: string,
): RouteRequestMatch {
  for (const entry of routes) {
    if (entry.route.method !== method) {
      continue;
    }
    const pathMatch = matchPath(entry.compiledPath, pathname);
    if (pathMatch.kind === 'match') {
      return {
        kind: 'match',
        key: entry.key,
        route: entry.route,
        params: pathMatch.params,
      };
    }
    if (pathMatch.kind === 'invalid_encoding') {
      return { kind: 'invalid_encoding', param: pathMatch.param };
    }
  }
  return { kind: 'route_not_found' };
}

function routesFromCompiled<TContract extends ContractDef>(
  compiled: ReturnType<typeof compileContract<TContract>>,
): readonly CompiledRoute[] {
  return Object.entries(compiled.routes).map(([key, entry]) => ({
    key,
    route: entry.route,
    compiledPath: entry.compiledPath,
  }));
}

function scopePath(pathname: string, basePath: `/${string}` | undefined): PathScope {
  if (basePath === undefined) {
    return { kind: 'scoped', pathname: normalizePath(pathname) };
  }

  const normalized = normalizePath(pathname);
  const normalizedBase = normalizePath(basePath);

  if (normalized === normalizedBase) {
    return { kind: 'scoped', pathname: '/' };
  }

  const prefix = `${normalizedBase}/`;
  if (normalized.startsWith(prefix)) {
    const remainder = normalized.slice(normalizedBase.length);
    return {
      kind: 'scoped',
      pathname: remainder.length === 0 ? '/' : remainder,
    };
  }

  return { kind: 'outside_base' };
}

interface ServeRuntime<TContext> {
  readonly compiled: CompiledContract<ContractDef>;
  readonly routes: readonly CompiledRoute[];
  readonly handlers: Handlers<ContractDef, TContext>;
  readonly options: ServeOptions;
  readonly hostStatuses: HostStatuses;
  readonly internalStatus: number;
  readonly basePath: `/${string}` | undefined;
}

function invalidEncodingResponse<TContext>(
  param: string,
  runtime: ServeRuntime<TContext>,
  disclosure: Disclosure,
): ProcessResult {
  return {
    response: respondWithError(
      railError('validation_error', 'Validation failed', {
        issues: [
          {
            path: ['params', param],
            message: 'Path parameter has invalid percent-encoding',
          },
        ],
      }),
      runtime.options,
      HOST_ONLY_ROUTE,
      runtime.hostStatuses,
      [runtime.hostStatuses.validation_error],
      disclosure,
    ),
  };
}

function handlerErrorResponse<TContext>(
  error: RailError<string>,
  declaredCodes: readonly string[],
  runtime: ServeRuntime<TContext>,
  route: RouteDef,
  declared: readonly number[],
  disclosure: Disclosure,
): ProcessResult {
  const normalized = isThrownInternal(error)
    ? error
    : normalizeHandlerError(error, declaredCodes);
  return {
    response: respondWithError(
      stampOrigin(normalized, runtime.options.origin),
      runtime.options,
      route,
      runtime.hostStatuses,
      declared,
      disclosure,
    ),
  };
}

function okResponse<TContext>(
  value: unknown,
  successStatus: number,
  route: RouteDef,
  runtime: ServeRuntime<TContext>,
  declared: readonly number[],
  disclosure: Disclosure,
): ProcessResult {
  const statuses = statusMapForRoute(route, runtime.hostStatuses);
  const response = respond(ok(value), {
    success: successStatus,
    statuses,
    declared,
    disclosure,
  });
  return {
    response: successResponse(
      response.status,
      response.body,
      runtime.hostStatuses.internal,
    ),
  };
}

async function readOptionalBody(
  request: Request,
  route: RouteDef,
): Promise<Result<unknown, RailError<'validation_error'>>> {
  if (route.body === undefined) {
    return ok(undefined);
  }
  return readRequestBody(request);
}

function rawSourcesForMatch(
  route: RouteDef,
  match: Extract<RouteRequestMatch, { kind: 'match' }>,
  url: URL,
  request: Request,
  rawBody: unknown,
) {
  return {
    ...(route.params !== undefined ? { params: match.params } : {}),
    ...(route.query !== undefined ? { query: searchParamsToObject(url) } : {}),
    ...(route.body !== undefined ? { body: rawBody } : {}),
    ...(route.headers !== undefined
      ? { headers: headersToRecord(request.headers) }
      : {}),
  };
}

async function invokeMatchedRoute<TContext>(
  runtime: ServeRuntime<TContext>,
  request: Request,
  context: TContext,
  url: URL,
  match: Extract<RouteRequestMatch, { kind: 'match' }>,
  disclosure: Disclosure,
): Promise<ProcessResult> {
  const route = match.route;
  const declared = declaredStatusesForRoute(route, runtime.hostStatuses);
  const successStatus = route.success ?? 200;

  const bodyResult = await readOptionalBody(request, route);
  if (bodyResult.isErr()) {
    return {
      response: respondWithError(
        bodyResult.error,
        runtime.options,
        route,
        runtime.hostStatuses,
        declared,
        disclosure,
      ),
    };
  }

  const sourcesResult = await parseRouteSources(
    route,
    rawSourcesForMatch(route, match, url, request, bodyResult.value),
  );

  if (sourcesResult.isErr()) {
    return {
      response: respondWithError(
        sourcesResult.error,
        runtime.options,
        route,
        runtime.hostStatuses,
        declared,
        disclosure,
      ),
    };
  }

  const handler = runtime.handlers[match.key] as Handler<RouteDef, TContext>;
  const handlerResult = await invokeHandler(handler, {
    ...sourcesResult.value,
    request,
    context,
  });

  if (handlerResult.isErr()) {
    return handlerErrorResponse(
      handlerResult.error,
      Object.keys(route.errors),
      runtime,
      route,
      declared,
      disclosure,
    );
  }

  if (successStatus === 204) {
    return okResponse(undefined, successStatus, route, runtime, declared, disclosure);
  }

  const outputResult = await parseOutput(route, handlerResult.value);
  if (outputResult.isErr()) {
    return {
      response: respondWithError(
        stampOrigin(outputResult.error, runtime.options.origin),
        runtime.options,
        route,
        runtime.hostStatuses,
        declared,
        disclosure,
      ),
    };
  }

  return okResponse(
    outputResult.value,
    successStatus,
    route,
    runtime,
    declared,
    disclosure,
  );
}

function outsideBaseResult<TContext>(
  runtime: ServeRuntime<TContext>,
  request: Request,
  cooperative: boolean,
): ProcessResult {
  if (cooperative) {
    return { kind: 'unmatched' };
  }
  const disclosure = resolveDisclosure(runtime.options.disclosure, request);
  return {
    response: routeNotFoundResponse(
      runtime.options,
      runtime.hostStatuses,
      disclosure,
    ),
  };
}

async function processRequest<TContext>(
  runtime: ServeRuntime<TContext>,
  request: Request,
  context: TContext,
  cooperative: boolean,
): Promise<ProcessResult> {
  try {
    const url = new URL(request.url);
    const scoped = scopePath(url.pathname, runtime.basePath);

    if (scoped.kind === 'outside_base') {
      return outsideBaseResult(runtime, request, cooperative);
    }

    if (cooperative && !isContractPath(runtime.compiled, scoped.pathname)) {
      return { kind: 'unmatched' };
    }

    const match = matchRequest(runtime.routes, request.method, scoped.pathname);
    const disclosure = resolveDisclosure(runtime.options.disclosure, request);

    if (match.kind === 'route_not_found') {
      return {
        response: routeNotFoundResponse(
          runtime.options,
          runtime.hostStatuses,
          disclosure,
        ),
      };
    }

    if (match.kind === 'invalid_encoding') {
      return invalidEncodingResponse(match.param, runtime, disclosure);
    }

    return invokeMatchedRoute(
      runtime,
      request,
      context,
      url,
      match,
      disclosure,
    );
  } catch {
    return {
      response: failsafeInternalResponse(runtime.internalStatus),
    };
  }
}

/** Web-standard fetch handler wired to a contract and handler map. */
export function serve<TContract extends ContractDef, TContext>(
  contract: TContract,
  handlers: Handlers<TContract, TContext>,
  options: ServeOptions = {},
): ServeHandler<TContext> {
  const compiled = compileContract(contract);
  assertHandlersComplete(
    compiled as unknown as CompiledContract<never>,
    handlers,
  );

  const hostStatuses = mergeHostStatuses(options.hostStatuses);
  const runtime: ServeRuntime<TContext> = {
    compiled: compiled as unknown as CompiledContract<ContractDef>,
    routes: routesFromCompiled(compiled),
    handlers: handlers as Handlers<ContractDef, TContext>,
    options,
    hostStatuses,
    internalStatus: hostStatuses.internal,
    basePath: options.basePath,
  };
  const internalStatus = runtime.internalStatus;

  const serveHandler = async (
    request: Request,
    context: TContext,
  ): Promise<Response> => {
    const result = await processRequest(runtime, request, context, false);
    return 'response' in result
      ? result.response
      : failsafeInternalResponse(internalStatus);
  };

  serveHandler.handle = async (
    request: Request,
    context: TContext,
  ): Promise<
    { matched: false } | { matched: true; response: Response }
  > => {
    const result = await processRequest(runtime, request, context, true);
    if (!('response' in result)) {
      return { matched: false };
    }
    return { matched: true, response: result.response };
  };

  return serveHandler;
}
