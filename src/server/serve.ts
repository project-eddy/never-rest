import { err, ok, type Result, ResultAsync } from 'neverthrow';

import {
  assertHandlersComplete,
  compileContract,
  ContractConfigurationError,
  type CompiledContract,
} from '../contract/compile.js';
import { matchPath } from '../contract/path.js';
import { parseInput, parseOutput } from '../contract/parse.js';
import type {
  ContractDef,
  HandlerInputOf,
  OutputOf,
  RouteDef,
} from '../contract/types.js';
import type { Disclosure } from '../disclose.js';
import { MAX_CAUSE_DEPTH, railError, type RailError } from '../error.js';
import { respond } from '../respond.js';
import type { CompiledRoute } from './router.js';
import type { ServeStatusMap } from './types.js';

export type Handler<TRoute extends RouteDef, TContext> = (
  args: {
    input: HandlerInputOf<TRoute>;
    params: Record<string, string>;
    request: Request;
    context: TContext;
  },
) =>
  | Result<OutputOf<TRoute>, RailError<TRoute['errors'][number]>>
  | ResultAsync<OutputOf<TRoute>, RailError<TRoute['errors'][number]>>
  | Promise<Result<OutputOf<TRoute>, RailError<TRoute['errors'][number]>>>;

export type Handlers<TContract extends ContractDef, TContext> = {
  readonly [K in keyof TContract]: Handler<TContract[K], TContext>;
};

export interface ServeOptions<TContract extends ContractDef> {
  readonly statuses: ServeStatusMap<TContract>;
  readonly disclosure?: Disclosure | ((request: Request) => Disclosure);
  readonly origin?: string;
}

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

const SERVER_HOST_ERROR_CODES = [
  'validation_error',
  'internal',
  'route_not_found',
] as const;

const FAILSAFE_INTERNAL_BODY =
  '{"code":"internal","message":"An unexpected error occurred"}';

type RouteRequestMatch =
  | {
      readonly kind: 'match';
      readonly key: string;
      readonly route: RouteDef;
      readonly params: Record<string, string>;
    }
  | { readonly kind: 'route_not_found' }
  | { readonly kind: 'invalid_encoding'; readonly param: string };

function collectDomainErrorCodes<TContract extends ContractDef>(
  contract: TContract,
): string[] {
  const codes = new Set<string>();
  for (const route of Object.values(contract)) {
    for (const code of route.errors) {
      codes.add(code);
    }
  }
  return [...codes];
}

function assertStatusMap(
  requiredCodes: readonly string[],
  statuses: Record<string, number>,
): void {
  for (const code of requiredCodes) {
    const status = statuses[code];
    if (!Number.isInteger(status) || status < 400 || status > 599) {
      throw new ContractConfigurationError(
        `Missing or invalid HTTP status for "${code}"`,
      );
    }
  }
}

function declaredStatusesForRoute<TContract extends ContractDef>(
  route: RouteDef,
  statuses: ServeStatusMap<TContract>,
): number[] {
  const declared = new Set<number>([200]);
  for (const code of route.errors) {
    declared.add(statuses[code as keyof ServeStatusMap<TContract>]);
  }
  if (route.input !== undefined) {
    declared.add(statuses.validation_error);
  }
  declared.add(statuses.internal);
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

/** Merge URL path params into body/query input so `:id` keys validate like the client sends. */
function mergePathParamsIntoInput(
  rawInput: unknown,
  params: Record<string, string>,
): unknown {
  const keys = Object.keys(params);
  if (keys.length === 0) {
    return rawInput;
  }

  const base: Record<string, unknown> =
    typeof rawInput === 'object' &&
    rawInput !== null &&
    !Array.isArray(rawInput)
      ? { ...(rawInput as Record<string, unknown>) }
      : {};

  for (const key of keys) {
    base[key] = params[key];
  }
  return base;
}

async function readRequestInput(
  request: Request,
  method: string,
): Promise<Result<unknown, RailError<'validation_error'>>> {
  if (BODY_METHODS.has(method)) {
    let text: string;
    try {
      text = await request.text();
    } catch {
      return err(
        railError('validation_error', 'Validation failed', {
          issues: [{ path: [], message: 'Could not read request body' }],
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
          issues: [{ path: [], message: 'Invalid JSON body' }],
        }),
      );
    }
  }
  return ok(searchParamsToObject(new URL(request.url)));
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

function respondWithError<TContract extends ContractDef>(
  error: RailError<string>,
  options: ServeOptions<TContract>,
  declared: readonly number[],
  disclosure: Disclosure,
): Response {
  const stamped = stampOrigin(error, options.origin);
  const response = respond(err(stamped), {
    success: 200,
    statuses: options.statuses,
    declared,
    disclosure,
  });
  return jsonResponse(
    response.status,
    response.body,
    options.statuses.internal,
  );
}

async function invokeHandler<TContext>(
  handler: Handler<RouteDef, TContext>,
  args: {
    input: unknown;
    params: Record<string, string>;
    request: Request;
    context: TContext;
  },
): Promise<Result<unknown, RailError<string>>> {
  try {
    return await handler({
      input: args.input as HandlerInputOf<RouteDef>,
      params: args.params,
      request: args.request,
      context: args.context,
    });
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

/** Web-standard fetch handler wired to a contract and handler map. */
export function serve<TContract extends ContractDef, TContext>(
  contract: TContract,
  handlers: Handlers<TContract, TContext>,
  options: ServeOptions<TContract>,
): (request: Request, context: TContext) => Promise<Response> {
  const compiled = compileContract(contract);
  assertHandlersComplete(
    compiled as unknown as CompiledContract<never>,
    handlers,
  );
  const requiredCodes = [
    ...collectDomainErrorCodes(contract),
    ...SERVER_HOST_ERROR_CODES,
  ];
  assertStatusMap(requiredCodes, options.statuses);

  const routes = routesFromCompiled(compiled);
  const internalStatus = options.statuses.internal;

  return async (request: Request, context: TContext): Promise<Response> => {
    try {
      const url = new URL(request.url);
      const match = matchRequest(routes, request.method, url.pathname);
      const disclosure = resolveDisclosure(options.disclosure, request);

      if (match.kind === 'route_not_found') {
        return respondWithError(
          railError('route_not_found', 'Not found'),
          options,
          [options.statuses.route_not_found],
          disclosure,
        );
      }

      if (match.kind === 'invalid_encoding') {
        return respondWithError(
          railError('validation_error', 'Validation failed', {
            issues: [
              {
                path: [match.param],
                message: 'Path parameter has invalid percent-encoding',
              },
            ],
          }),
          options,
          [options.statuses.validation_error],
          disclosure,
        );
      }

      const route = match.route;
      const declared = declaredStatusesForRoute(route, options.statuses);
      const rawInputResult = await readRequestInput(request, request.method);

      if (rawInputResult.isErr()) {
        return respondWithError(
          rawInputResult.error,
          options,
          declared,
          disclosure,
        );
      }

      const mergedInput = mergePathParamsIntoInput(
        rawInputResult.value,
        match.params,
      );
      const inputResult = await parseInput(route, mergedInput);
      if (inputResult.isErr()) {
        return respondWithError(inputResult.error, options, declared, disclosure);
      }

      const handler = handlers[match.key as keyof TContract] as Handler<
        RouteDef,
        TContext
      >;
      const handlerResult = await invokeHandler(handler, {
        input: inputResult.value,
        params: match.params,
        request,
        context,
      });

      if (handlerResult.isErr()) {
        const normalized = isThrownInternal(handlerResult.error)
          ? handlerResult.error
          : normalizeHandlerError(handlerResult.error, route.errors);
        return respondWithError(
          stampOrigin(normalized, options.origin),
          options,
          declared,
          disclosure,
        );
      }

      const outputResult = await parseOutput(route, handlerResult.value);
      if (outputResult.isErr()) {
        return respondWithError(
          stampOrigin(outputResult.error, options.origin),
          options,
          declared,
          disclosure,
        );
      }

      const response = respond(ok(outputResult.value), {
        success: 200,
        statuses: options.statuses,
        declared,
        disclosure,
      });
      return jsonResponse(
        response.status,
        response.body,
        options.statuses.internal,
      );
    } catch {
      return failsafeInternalResponse(internalStatus);
    }
  };
}
