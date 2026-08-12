import { err, ok, type Result, ResultAsync } from 'neverthrow';

import {
  assertHandlersComplete,
  compileContract,
  ContractConfigurationError,
  type CompiledContract,
} from '../contract/compile.js';
import { matchPath } from '../contract/path.js';
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
import type { CompiledRoute } from './router.js';
import type { ServeStatusMap } from './types.js';

export type Handler<TRoute extends RouteDef, TContext> = (
  args: HandlerArgsOf<TRoute> & {
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
  if (
    route.params !== undefined ||
    route.query !== undefined ||
    route.body !== undefined
  ) {
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
                path: ['params', match.param],
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

      let rawBody: unknown;
      if (route.body !== undefined) {
        const bodyResult = await readRequestBody(request);
        if (bodyResult.isErr()) {
          return respondWithError(
            bodyResult.error,
            options,
            declared,
            disclosure,
          );
        }
        rawBody = bodyResult.value;
      }

      const sourcesResult = await parseRouteSources(route, {
        ...(route.params !== undefined ? { params: match.params } : {}),
        ...(route.query !== undefined
          ? { query: searchParamsToObject(url) }
          : {}),
        ...(route.body !== undefined ? { body: rawBody } : {}),
      });

      if (sourcesResult.isErr()) {
        return respondWithError(
          sourcesResult.error,
          options,
          declared,
          disclosure,
        );
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
