import { err, ok, type Result, ResultAsync } from 'neverthrow';

import {
  BOUNDARY_HTTP_STATUSES,
  BOUNDARY_STATUS_MAP,
  isBoundaryErrorCode,
} from '../boundary.js';
import {
  assertHandlersComplete,
  compileContract,
  ContractConfigurationError,
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
import {
  acquireConcurrency,
  admitAnonymous,
  admitPrincipal,
  assertAdmissionOptions,
} from '../limits/index.js';
import type { AdmissionOptions, ConcurrencyRelease } from '../limits/types.js';
import { verifyHttpPrincipal } from '../policy/apply.js';
import type { Policy } from '../policy/types.js';
import { respond } from '../respond.js';
import { retryAfterHeaderSeconds } from '../retry-after.js';
import { combineAbortSignals, errorForAbort } from '../signals.js';
import {
  HOST_STATUSES,
  type HostStatuses,
  type StatusMap,
} from '../status.js';
import { readBoundedJsonBody, resolveBodyLimits, type BodyLimits } from './body.js';
import type { CompiledRoute } from './router.js';
import type { ServeHandler, ServeOptions, ServeTimeouts } from './types.js';

export type Handler<TRoute extends RouteDef, TContext, TPrincipal = unknown> = (
  args: HandlerArgsOf<TRoute> & {
    request: Request;
    context: TContext;
    principal: TPrincipal | undefined;
    signal: AbortSignal;
  },
) =>
  | Result<OutputOf<TRoute>, RailError<keyof TRoute['errors'] & string>>
  | ResultAsync<OutputOf<TRoute>, RailError<keyof TRoute['errors'] & string>>
  | Promise<
      Result<OutputOf<TRoute>, RailError<keyof TRoute['errors'] & string>>
    >;

export type Handlers<
  TContract extends ContractDef,
  TContext,
  TPrincipal = unknown,
> = {
  readonly [K in keyof TContract]: Handler<TContract[K], TContext, TPrincipal>;
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
  return { ...BOUNDARY_STATUS_MAP, ...route.errors, ...hostStatuses };
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
  for (const status of BOUNDARY_HTTP_STATUSES) {
    declared.add(status);
  }
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

async function readOptionalBody(
  request: Request,
  route: RouteDef,
  limits: BodyLimits,
): Promise<Result<unknown, RailError<string>>> {
  if (route.body === undefined) {
    return ok(undefined);
  }
  return readBoundedJsonBody(request, limits);
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
  if (declaredCodes.includes(error.code) || isBoundaryErrorCode(error.code)) {
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

function jsonHeaders(error?: RailError<string>): Headers {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (error?.retryAfterMs !== undefined) {
    headers.set('retry-after', retryAfterHeaderSeconds(error.retryAfterMs));
  }
  return headers;
}

function jsonResponse(
  status: number,
  body: unknown,
  fallbackStatus: number,
  error?: RailError<string>,
): Response {
  try {
    return new Response(JSON.stringify(body), {
      status,
      headers: jsonHeaders(error),
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
    stamped,
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

async function invokeHandler<TContext, TPrincipal>(
  handler: Handler<RouteDef, TContext, TPrincipal>,
  args: HandlerArgsOf<RouteDef> & {
    request: Request;
    context: TContext;
    principal: TPrincipal | undefined;
    signal: AbortSignal;
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

interface ServeRuntime<TContext, TPrincipal = unknown> {
  readonly compiled: CompiledContract<ContractDef>;
  readonly routes: readonly CompiledRoute[];
  readonly handlers: Handlers<ContractDef, TContext, TPrincipal>;
  readonly options: ServeOptions<TPrincipal>;
  readonly hostStatuses: HostStatuses;
  readonly internalStatus: number;
  readonly basePath: `/${string}` | undefined;
  readonly limits: BodyLimits;
  readonly timeouts: ServeTimeouts | undefined;
  readonly policy: Policy<ContractDef, TPrincipal> | undefined;
  readonly admission: AdmissionOptions<TPrincipal> | undefined;
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

function errorResult<TContext>(
  error: RailError<string>,
  runtime: ServeRuntime<TContext>,
  route: RouteDef,
  declared: readonly number[],
  disclosure: Disclosure,
): ProcessResult {
  return {
    response: respondWithError(
      error,
      runtime.options,
      route,
      runtime.hostStatuses,
      declared,
      disclosure,
    ),
  };
}

function handlerDeadline(
  timeouts: ServeTimeouts | undefined,
  operation: string,
): AbortSignal | undefined {
  const timeoutMs = timeouts?.operations?.[operation] ?? timeouts?.defaultMs;
  if (timeoutMs === undefined) {
    return undefined;
  }
  return AbortSignal.timeout(timeoutMs);
}

async function finishHandler<TContext>(
  runtime: ServeRuntime<TContext>,
  route: RouteDef,
  handlerResult: Result<unknown, RailError<string>>,
  signal: AbortSignal,
  declared: readonly number[],
  disclosure: Disclosure,
  successStatus: number,
): Promise<ProcessResult> {
  if (signal.aborted) {
    return handlerErrorResponse(
      errorForAbort(signal),
      Object.keys(route.errors),
      runtime,
      route,
      declared,
      disclosure,
    );
  }
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
    return errorResult(
      stampOrigin(outputResult.error, runtime.options.origin),
      runtime,
      route,
      declared,
      disclosure,
    );
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

async function runMatchedHandler<TContext>(
  runtime: ServeRuntime<TContext>,
  request: Request,
  context: TContext,
  match: Extract<RouteRequestMatch, { kind: 'match' }>,
  parsed: HandlerArgsOf<RouteDef>,
  principal: unknown,
  declared: readonly number[],
  disclosure: Disclosure,
  successStatus: number,
): Promise<ProcessResult> {
  const route = match.route;
  const signal = combineAbortSignals([
    request.signal,
    handlerDeadline(runtime.timeouts, match.key),
  ]);
  const slot = await acquireConcurrency(runtime.admission, signal, match.key);
  if (slot.isErr()) {
    return errorResult(slot.error, runtime, route, declared, disclosure);
  }
  const release: ConcurrencyRelease = slot.value;
  try {
    const handler = runtime.handlers[match.key] as Handler<RouteDef, TContext>;
    const handlerResult = await invokeHandler(handler, {
      ...parsed,
      request,
      context,
      principal,
      signal,
    });
    return finishHandler(
      runtime,
      route,
      handlerResult,
      signal,
      declared,
      disclosure,
      successStatus,
    );
  } finally {
    release();
  }
}

async function invokeMatchedRoute<TContext>(
  runtime: ServeRuntime<TContext>,
  request: Request,
  context: TContext,
  url: URL,
  match: Extract<RouteRequestMatch, { kind: 'match' }>,
  principal: unknown,
  disclosure: Disclosure,
): Promise<ProcessResult> {
  const route = match.route;
  const declared = declaredStatusesForRoute(route, runtime.hostStatuses);
  const successStatus = route.success ?? 200;

  const bodyResult = await readOptionalBody(request, route, runtime.limits);
  if (bodyResult.isErr()) {
    return errorResult(bodyResult.error, runtime, route, declared, disclosure);
  }

  const sourcesResult = await parseRouteSources(
    route,
    rawSourcesForMatch(route, match, url, request, bodyResult.value),
  );
  if (sourcesResult.isErr()) {
    return errorResult(sourcesResult.error, runtime, route, declared, disclosure);
  }

  if (runtime.policy !== undefined) {
    const authorized = await runtime.policy.authorize(
      match.key,
      principal,
      sourcesResult.value,
    );
    if (authorized.isErr()) {
      return errorResult(authorized.error, runtime, route, declared, disclosure);
    }
  }

  const admitted = await admitPrincipal(runtime.admission, principal, match.key);
  if (admitted.isErr()) {
    return errorResult(admitted.error, runtime, route, declared, disclosure);
  }

  return runMatchedHandler(
    runtime,
    request,
    context,
    match,
    sourcesResult.value,
    principal,
    declared,
    disclosure,
    successStatus,
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

function disclosureForCaller<TContext>(
  runtime: ServeRuntime<TContext>,
  request: Request,
  principal: unknown,
): Disclosure {
  if (runtime.policy !== undefined) {
    return runtime.policy.disclosureFor(principal);
  }
  return resolveDisclosure(runtime.options.disclosure, request);
}

function unmatchedOrInvalid<TContext>(
  runtime: ServeRuntime<TContext>,
  match: RouteRequestMatch,
  disclosure: Disclosure,
): ProcessResult | undefined {
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
  return undefined;
}

async function processMatchedRequest<TContext>(
  runtime: ServeRuntime<TContext>,
  request: Request,
  context: TContext,
  url: URL,
  pathname: string,
): Promise<ProcessResult> {
  const admitted = await admitAnonymous(
    runtime.admission,
    { request, context },
    '*',
  );
  const fallbackDisclosure = disclosureForCaller(runtime, request, undefined);
  if (admitted.isErr()) {
    return {
      response: respondWithError(
        admitted.error,
        runtime.options,
        HOST_ONLY_ROUTE,
        runtime.hostStatuses,
        BOUNDARY_HTTP_STATUSES,
        fallbackDisclosure,
      ),
    };
  }

  const match = matchRequest(runtime.routes, request.method, pathname);
  const early = unmatchedOrInvalid(runtime, match, fallbackDisclosure);
  if (early !== undefined) {
    return early;
  }

  const verified = await verifyHttpPrincipal(runtime.policy, request);
  if (verified.isErr()) {
    return {
      response: respondWithError(
        verified.error,
        runtime.options,
        match.kind === 'match' ? match.route : HOST_ONLY_ROUTE,
        runtime.hostStatuses,
        BOUNDARY_HTTP_STATUSES,
        fallbackDisclosure,
      ),
    };
  }

  const disclosure = disclosureForCaller(runtime, request, verified.value);
  return invokeMatchedRoute(
    runtime,
    request,
    context,
    url,
    match as Extract<RouteRequestMatch, { kind: 'match' }>,
    verified.value,
    disclosure,
  );
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

    return processMatchedRequest(runtime, request, context, url, scoped.pathname);
  } catch {
    return {
      response: failsafeInternalResponse(runtime.internalStatus),
    };
  }
}

function assertServeOptions(options: ServeOptions): void {
  if (options.policy !== undefined && options.disclosure !== undefined) {
    throw new ContractConfigurationError(
      'ServeOptions cannot set both policy and disclosure',
    );
  }
  assertAdmissionOptions(options.admission);
}

/** Web-standard fetch handler wired to a contract and handler map. */
export function serve<
  TContract extends ContractDef,
  TContext = undefined,
  TPrincipal = unknown,
>(
  contract: TContract,
  handlers: Handlers<TContract, TContext, TPrincipal>,
  options: ServeOptions<TPrincipal, TContract> = {},
): ServeHandler<TContext> {
  const compiled = compileContract(contract);
  assertHandlersComplete(
    compiled as unknown as CompiledContract<never>,
    handlers,
  );
  assertServeOptions(options as ServeOptions);

  const hostStatuses = mergeHostStatuses(options.hostStatuses);
  const runtime: ServeRuntime<TContext> = {
    compiled: compiled as unknown as CompiledContract<ContractDef>,
    routes: routesFromCompiled(compiled),
    handlers: handlers as Handlers<ContractDef, TContext>,
    options: options as ServeOptions,
    hostStatuses,
    internalStatus: hostStatuses.internal,
    basePath: options.basePath,
    limits: resolveBodyLimits(options.limits),
    timeouts: options.timeouts,
    policy: options.policy as Policy<ContractDef, unknown> | undefined,
    admission: options.admission as AdmissionOptions<unknown> | undefined,
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
