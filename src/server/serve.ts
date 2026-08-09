import { err, ok, type Result, ResultAsync } from 'neverthrow';

import { parseInput } from '../contract/parse.js';
import type { ContractDef, InputOf, OutputOf, RouteDef } from '../contract/types.js';
import type { Disclosure } from '../disclose.js';
import { railError, type RailError } from '../error.js';
import { respond } from '../respond.js';
import type { StatusMap } from '../status.js';
import { compileRoutes, matchRoute } from './router.js';

export type Handler<TRoute extends RouteDef, TContext> = (
  args: {
    input: InputOf<TRoute>;
    params: Record<string, string>;
    request: Request;
    context: TContext;
  },
) =>
  | ResultAsync<OutputOf<TRoute>, RailError<TRoute['errors'][number]>>
  | Promise<Result<OutputOf<TRoute>, RailError<TRoute['errors'][number]>>>;

export type Handlers<TContract extends ContractDef, TContext> = {
  readonly [K in keyof TContract]: Handler<TContract[K], TContext>;
};

export interface ServeOptions<TCode extends string> {
  readonly statuses: StatusMap<TCode>;
  readonly disclosure?: Disclosure | ((request: Request) => Disclosure);
  readonly origin?: string;
}

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

function declaredStatusesForRoute(
  route: RouteDef,
  statuses: StatusMap<string>,
): number[] {
  const declared = new Set<number>([200]);
  for (const code of route.errors) {
    declared.add(statuses[code]);
  }
  if (route.input !== undefined) {
    declared.add(statuses.validation_error);
  }
  declared.add(statuses.internal);
  return [...declared];
}

function stampOrigin(error: RailError, origin: string | undefined): RailError {
  if (origin === undefined) {
    return error;
  }
  const stamped: RailError = {
    ...error,
    origin: error.origin ?? origin,
  };
  if (error.cause !== undefined) {
    return { ...stamped, cause: stampOrigin(error.cause, origin) };
  }
  return stamped;
}

function searchParamsToObject(url: URL): Record<string, string> {
  const values: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    values[key] = value;
  });
  return values;
}

async function readRequestInput(
  request: Request,
  method: string,
): Promise<Result<unknown, RailError<'validation_error'>>> {
  if (BODY_METHODS.has(method)) {
    const text = await request.text();
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

function resolveDisclosure(
  disclosure: Disclosure | ((request: Request) => Disclosure) | undefined,
  request: Request,
): Disclosure | undefined {
  if (typeof disclosure === 'function') {
    return disclosure(request);
  }
  return disclosure;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function respondWithError(
  error: RailError<string>,
  options: ServeOptions<string>,
  declared: readonly number[],
  disclosure: Disclosure | undefined,
): Response {
  const stamped = stampOrigin(error, options.origin);
  const response = respond(err(stamped), {
    success: 200,
    statuses: options.statuses,
    declared,
    disclosure,
  });
  return jsonResponse(response.status, response.body);
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
      input: args.input as InputOf<RouteDef>,
      params: args.params,
      request: args.request,
      context: args.context,
    });
  } catch (thrown) {
    return err(internalFromThrown(thrown));
  }
}

/** Web-standard fetch handler wired to a contract and handler map. */
export function serve<TContract extends ContractDef, TContext>(
  contract: TContract,
  handlers: Handlers<TContract, TContext>,
  options: ServeOptions<string>,
): (request: Request, context: TContext) => Promise<Response> {
  const routes = compileRoutes(contract);

  return async (request: Request, context: TContext): Promise<Response> => {
    const url = new URL(request.url);
    const match = matchRoute(routes, request.method, url.pathname);
    const disclosure = resolveDisclosure(options.disclosure, request);

    if (match === undefined) {
      return respondWithError(
        railError('not_found', 'Not found'),
        options,
        [options.statuses.not_found],
        disclosure,
      );
    }

    const route = match.route;
    const declared = declaredStatusesForRoute(route, options.statuses);
    const rawInputResult = await readRequestInput(request, request.method);

    if (rawInputResult.isErr()) {
      return respondWithError(rawInputResult.error, options, declared, disclosure);
    }

    const inputResult = await parseInput(route, rawInputResult.value);
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

    const stampedResult = handlerResult.mapErr((error) =>
      stampOrigin(error, options.origin),
    );

    const response = respond(stampedResult, {
      success: 200,
      statuses: options.statuses,
      declared,
      disclosure,
    });
    return jsonResponse(response.status, response.body);
  };
}
