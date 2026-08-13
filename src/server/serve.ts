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
    const { cause: _cause, ...withoutCause } = error;
    return {
      ...withoutCause,
      origin: error.origin ?? origin,
    };
  }
  seen.add(error);
  const stamped: RailError = {
    ...error,
    origin: error.origin ?? origin,
  };
  if (error.cause !== undefined) {
    if (seen.has(error.cause) || depth + 1 > MAX_CAUSE_DEPTH) {
      const { cause: _cause, ...withoutCause } = stamped;
      return withoutCause;
    }
    return {
      ...stamped,
      cause: stampOrigin(error.cause, origin, depth + 1, seen),
    };
  }
  return stamped;
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

  const routes = routesFromCompiled(compiled);
  const hostStatuses = mergeHostStatuses(options.hostStatuses);
  const internalStatus = hostStatuses.internal;
  const basePath = options.basePath;

  async function processRequest(
    request: Request,
    context: TContext,
    cooperative: boolean,
  ): Promise<ProcessResult> {
    try {
      const url = new URL(request.url);
      const scoped = scopePath(url.pathname, basePath);

      if (scoped.kind === 'outside_base') {
        if (cooperative) {
          return { kind: 'unmatched' };
        }
        const disclosure = resolveDisclosure(options.disclosure, request);
        return {
          response: routeNotFoundResponse(options, hostStatuses, disclosure),
        };
      }

      if (cooperative && !isContractPath(compiled, scoped.pathname)) {
        return { kind: 'unmatched' };
      }

      const match = matchRequest(routes, request.method, scoped.pathname);
      const disclosure = resolveDisclosure(options.disclosure, request);

      if (match.kind === 'route_not_found') {
        return {
          response: routeNotFoundResponse(options, hostStatuses, disclosure),
        };
      }

      if (match.kind === 'invalid_encoding') {
        return {
          response: respondWithError(
            railError('validation_error', 'Validation failed', {
              issues: [
                {
                  path: ['params', match.param],
                  message: 'Path parameter has invalid percent-encoding',
                },
              ],
            }),
            options,
            HOST_ONLY_ROUTE,
            hostStatuses,
            [hostStatuses.validation_error],
            disclosure,
          ),
        };
      }

      const route = match.route;
      const declared = declaredStatusesForRoute(route, hostStatuses);
      const successStatus = route.success ?? 200;

      let rawBody: unknown;
      if (route.body !== undefined) {
        const bodyResult = await readRequestBody(request);
        if (bodyResult.isErr()) {
          return {
            response: respondWithError(
              bodyResult.error,
              options,
              route,
              hostStatuses,
              declared,
              disclosure,
            ),
          };
        }
        rawBody = bodyResult.value;
      }

      const sourcesResult = await parseRouteSources(route, {
        ...(route.params !== undefined ? { params: match.params } : {}),
        ...(route.query !== undefined
          ? { query: searchParamsToObject(url) }
          : {}),
        ...(route.body !== undefined ? { body: rawBody } : {}),
        ...(route.headers !== undefined
          ? { headers: headersToRecord(request.headers) }
          : {}),
      });

      if (sourcesResult.isErr()) {
        return {
          response: respondWithError(
            sourcesResult.error,
            options,
            route,
            hostStatuses,
            declared,
            disclosure,
          ),
        };
      }

      const handler = handlers[match.key as keyof TContract] as Handler<
        RouteDef,
        TContext
      >;
      const handlerResult = await invokeHandler(handler, {
        ...sourcesResult.value,
        request,
        context,
      });

      const declaredCodes = Object.keys(route.errors);
      if (handlerResult.isErr()) {
        const normalized = isThrownInternal(handlerResult.error)
          ? handlerResult.error
          : normalizeHandlerError(handlerResult.error, declaredCodes);
        return {
          response: respondWithError(
            stampOrigin(normalized, options.origin),
            options,
            route,
            hostStatuses,
            declared,
            disclosure,
          ),
        };
      }

      if (successStatus !== 204) {
        const outputResult = await parseOutput(route, handlerResult.value);
        if (outputResult.isErr()) {
          return {
            response: respondWithError(
              stampOrigin(outputResult.error, options.origin),
              options,
              route,
              hostStatuses,
              declared,
              disclosure,
            ),
          };
        }

        const statuses = statusMapForRoute(route, hostStatuses);
        const response = respond(ok(outputResult.value), {
          success: successStatus,
          statuses,
          declared,
          disclosure,
        });
        return {
          response: successResponse(
            response.status,
            response.body,
            hostStatuses.internal,
          ),
        };
      }

      const statuses = statusMapForRoute(route, hostStatuses);
      const response = respond(ok(undefined), {
        success: successStatus,
        statuses,
        declared,
        disclosure,
      });
      return {
        response: successResponse(
          response.status,
          response.body,
          hostStatuses.internal,
        ),
      };
    } catch {
      return {
        response: failsafeInternalResponse(internalStatus),
      };
    }
  }

  const serveHandler = async (
    request: Request,
    context: TContext,
  ): Promise<Response> => {
    const result = await processRequest(request, context, false);
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
    const result = await processRequest(request, context, true);
    if (!('response' in result)) {
      return { matched: false };
    }
    return { matched: true, response: result.response };
  };

  return serveHandler;
}
