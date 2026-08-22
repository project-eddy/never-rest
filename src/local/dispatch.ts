/**
 * In-process dispatch for a `ContractDef`. No `Request`, no `Response`, no JSON
 * round-trip — declared schemas still validate both directions.
 *
 * Imports are confined to `../contract/`, `../disclose.js`, and `../error.js` so
 * this module can be extracted as a standalone package. That is why the small
 * `internal`-from-thrown and host-code helpers are restated here rather than
 * shared with `../server/serve.ts`.
 */
import { err, errAsync, ok, ResultAsync, type Result } from 'neverthrow';
import { ContractConfigurationError } from '../contract/compile.js';
import {
  parseOutput,
  parseRouteSources,
  type RawRouteSources,
} from '../contract/parse.js';
import type { ContractDef, RouteDef } from '../contract/types.js';
import { disclose, type Disclosure } from '../disclose.js';
import { railError, type RailError } from '../error.js';
import type {
  LocalClient,
  LocalDispatcher,
  LocalHandler,
  LocalHandlers,
  LocalOptions,
} from './types.js';

const DEFAULT_DISCLOSURE: Disclosure = 'full';

type AnyHandler<TContext> = LocalHandler<RouteDef, TContext>;

function internalFromThrown(thrown: unknown): RailError<'internal'> {
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  return railError('internal', 'An unexpected error occurred', {
    cause: railError('internal', message),
  });
}

/** Pick declared sources off caller args; local callers pass them unencoded. */
function toRawSources(args: unknown): RawRouteSources {
  if (typeof args !== 'object' || args === null) {
    return {};
  }

  const record = args as {
    readonly params?: Record<string, string>;
    readonly query?: unknown;
    readonly body?: unknown;
    readonly headers?: unknown;
  };

  return {
    ...(record.params !== undefined ? { params: record.params } : {}),
    ...(record.query !== undefined ? { query: record.query } : {}),
    ...(record.body !== undefined ? { body: record.body } : {}),
    ...(record.headers !== undefined ? { headers: record.headers } : {}),
  };
}

function withOrigin<TCode extends string>(
  error: RailError<TCode>,
  origin: string | undefined,
): RailError<TCode> {
  if (origin === undefined || error.origin !== undefined) {
    return error;
  }

  return { ...error, origin };
}

async function runRoute<TContext>(
  route: RouteDef,
  handler: AnyHandler<TContext>,
  args: unknown,
  context: TContext,
): Promise<Result<unknown, RailError<string>>> {
  const parsed = await parseRouteSources(route, toRawSources(args));
  if (parsed.isErr()) {
    return err(parsed.error);
  }

  let handled: Result<unknown, RailError<string>>;
  try {
    handled = await handler({ ...parsed.value, context });
  } catch (thrown) {
    return err(internalFromThrown(thrown));
  }

  if (handled.isErr()) {
    return err(handled.error);
  }

  const validated = await parseOutput(route, handled.value);
  if (validated.isErr()) {
    return err(validated.error);
  }

  return ok(validated.value);
}

function invokeRoute<TContext>(
  route: RouteDef,
  handler: AnyHandler<TContext>,
  args: unknown,
  context: TContext,
  origin: string | undefined,
  level: Disclosure,
): ResultAsync<unknown, RailError<string>> {
  return ResultAsync.fromPromise(
    runRoute(route, handler, args, context),
    internalFromThrown,
  )
    .andThen((result) => result)
    .mapErr((error) => disclose(withOrigin(error, origin), level));
}

function assertLocalHandlers(contract: ContractDef, handlers: object): void {
  const handlerMap = handlers as Record<string, unknown>;
  for (const operation of Object.keys(contract)) {
    if (typeof handlerMap[operation] !== 'function') {
      throw new ContractConfigurationError(
        `Missing handler for operation "${operation}"`,
      );
    }
  }
}

/**
 * Operation-addressed dispatch, for transports that carry the operation as a
 * string. Route `errors` status maps are ignored — HTTP status is not a local
 * concern.
 */
export function createDispatcher<
  TContract extends ContractDef,
  TContext = undefined,
>(
  contract: TContract,
  handlers: LocalHandlers<TContract, TContext>,
  options: LocalOptions<TContext> = {},
): LocalDispatcher<TContract, TContext> {
  assertLocalHandlers(contract, handlers);

  const operations = Object.keys(contract) as (keyof TContract & string)[];
  const level = options.disclosure ?? DEFAULT_DISCLOSURE;
  const handlerMap = handlers as Record<string, AnyHandler<TContext>>;

  return {
    operations,
    dispatch(operation, args, context) {
      const route = contract[operation];
      const handler = handlerMap[operation];

      if (route === undefined || handler === undefined) {
        return errAsync(
          disclose(
            withOrigin(
              railError(
                'route_not_found',
                `No operation "${operation}" in this contract`,
              ),
              options.origin,
            ),
            level,
          ),
        );
      }

      return invokeRoute(
        route,
        handler,
        args,
        context ?? (options.context as TContext),
        options.origin,
        level,
      );
    },
  };
}

/**
 * Typed module-to-module client. One method per operation, each returning the
 * route's declared output or a `RailError`.
 */
export function createLocalClient<
  TContract extends ContractDef,
  TContext = undefined,
>(
  contract: TContract,
  handlers: LocalHandlers<TContract, TContext>,
  options: LocalOptions<TContext> = {},
): LocalClient<TContract> {
  const dispatcher = createDispatcher(contract, handlers, options);
  const client: Record<
    string,
    (args: unknown) => ResultAsync<unknown, RailError<string>>
  > = {};

  for (const operation of dispatcher.operations) {
    client[operation] = (args) => dispatcher.dispatch(operation, args);
  }

  return client as LocalClient<TContract>;
}
