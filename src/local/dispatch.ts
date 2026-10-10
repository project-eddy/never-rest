/**
 * In-process dispatch for a `ContractDef`. No `Request`, no `Response`, no JSON
 * round-trip — declared schemas still validate both directions.
 *
 * Imports are confined to `../contract/`, `../disclose.js`, `../error.js`,
 * policy, limits, and signals so this module can be extracted as a standalone
 * package.
 */
import { err, errAsync, ok, ResultAsync, type Result } from 'neverthrow';

import {
  ContractConfigurationError,
} from '../contract/compile.js';
import {
  parseOutput,
  parseRouteSources,
  type RawRouteSources,
} from '../contract/parse.js';
import type { ContractDef, RouteDef } from '../contract/types.js';
import { disclose, type Disclosure } from '../disclose.js';
import { railError, type RailError } from '../error.js';
import {
  acquireConcurrency,
  admitAnonymous,
  admitPrincipal,
  assertAdmissionOptions,
} from '../limits/index.js';
import type { ConcurrencyRelease } from '../limits/types.js';
import { requireLocalPrincipal } from '../policy/apply.js';
import { combineAbortSignals, errorForAbort } from '../signals.js';
import type {
  LocalCallOptions,
  LocalClient,
  LocalDispatcher,
  LocalHandler,
  LocalHandlers,
  LocalOptions,
} from './types.js';

const DISPATCHER_DEFAULT_DISCLOSURE: Disclosure = 'public';
const LOCAL_CLIENT_DEFAULT_DISCLOSURE: Disclosure = 'full';

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

function assertLocalOptions<TContext>(options: LocalOptions<TContext>): void {
  if (options.policy !== undefined && options.disclosure !== undefined) {
    throw new ContractConfigurationError(
      'LocalOptions cannot set both policy and disclosure',
    );
  }
  assertAdmissionOptions(options.admission);
}

function resolveLocalDisclosure<TContext>(
  options: LocalOptions<TContext>,
  principal: unknown,
  fallback: Disclosure,
): Disclosure {
  if (options.policy !== undefined) {
    return options.policy.disclosureFor(principal);
  }
  return options.disclosure ?? fallback;
}

async function invokeLocalHandler<TContext>(
  handler: AnyHandler<TContext>,
  parsed: object,
  context: TContext,
  principal: unknown,
  signal: AbortSignal,
): Promise<Result<unknown, RailError<string>>> {
  try {
    return await handler({ ...parsed, context, principal, signal });
  } catch (thrown) {
    return err(internalFromThrown(thrown));
  }
}

async function runRoute<TContext>(
  route: RouteDef,
  handler: AnyHandler<TContext>,
  args: unknown,
  context: TContext,
  principal: unknown,
  signal: AbortSignal,
): Promise<Result<unknown, RailError<string>>> {
  const parsed = await parseRouteSources(route, toRawSources(args));
  if (parsed.isErr()) {
    return err(parsed.error);
  }

  const handled = await invokeLocalHandler(
    handler,
    parsed.value,
    context,
    principal,
    signal,
  );
  if (handled.isErr()) {
    return err(handled.error);
  }
  if (signal.aborted) {
    return err(errorForAbort(signal));
  }

  const validated = await parseOutput(route, handled.value);
  if (validated.isErr()) {
    return err(validated.error);
  }

  return ok(validated.value);
}

function discloseLocal(
  error: RailError<string>,
  origin: string | undefined,
  level: Disclosure,
): RailError<string> {
  return disclose(withOrigin(error, origin), level);
}

async function authorizeAndAdmit<TContext>(
  options: LocalOptions<TContext>,
  operation: string,
  args: unknown,
  principal: unknown,
  context: TContext,
  signal: AbortSignal,
): Promise<Result<ConcurrencyRelease, RailError<string>>> {
  const required = await requireLocalPrincipal(
    options.policy,
    operation,
    principal,
  );
  if (required.isErr()) {
    return err(required.error);
  }
  if (options.policy !== undefined) {
    const authorized = await options.policy.authorize(
      operation,
      required.value,
      args,
    );
    if (authorized.isErr()) {
      return err(authorized.error);
    }
  }
  const anonymous = await admitAnonymous(
    options.admission,
    { context },
    operation,
  );
  if (anonymous.isErr()) {
    return err(anonymous.error);
  }
  const limited = await admitPrincipal(options.admission, required.value, operation);
  if (limited.isErr()) {
    return err(limited.error);
  }
  const slot = await acquireConcurrency(options.admission, signal, operation);
  if (slot.isErr()) {
    return err(slot.error);
  }
  return ok(slot.value);
}

function invokeRoute<TContext>(
  route: RouteDef,
  handler: AnyHandler<TContext>,
  args: unknown,
  context: TContext,
  principal: unknown,
  signal: AbortSignal,
  origin: string | undefined,
  level: Disclosure,
): ResultAsync<unknown, RailError<string>> {
  return ResultAsync.fromPromise(
    runRoute(route, handler, args, context, principal, signal),
    internalFromThrown,
  )
    .andThen((result) => result)
    .mapErr((error) => discloseLocal(error, origin, level));
}

function missingOperation(
  operation: string,
  origin: string | undefined,
  level: Disclosure,
): ResultAsync<unknown, RailError<string>> {
  return errAsync(
    discloseLocal(
      railError('route_not_found', `No operation "${operation}" in this contract`),
      origin,
      level,
    ),
  );
}

/**
 * Operation-addressed dispatch, for transports that carry the operation as a
 * string. Route `errors` status maps are ignored — HTTP status is not a local
 * concern. Disclosure defaults to `public` because foreign transports are not
 * in the same trust circle.
 */
export function createDispatcher<
  TContract extends ContractDef,
  TContext = undefined,
  TPrincipal = unknown,
>(
  contract: TContract,
  handlers: LocalHandlers<TContract, TContext, TPrincipal>,
  options: LocalOptions<TContext, TPrincipal, TContract> = {},
): LocalDispatcher<TContract, TContext, TPrincipal> {
  assertLocalHandlers(contract, handlers);
  assertLocalOptions(options as LocalOptions<TContext>);

  const operations = Object.keys(contract) as (keyof TContract & string)[];
  const handlerMap = handlers as Record<string, AnyHandler<TContext>>;

  return {
    operations,
    dispatch(operation, args, callOptions) {
      const route = contract[operation];
      const handler = handlerMap[operation];
      const principal = callOptions?.principal;
      const context = (callOptions?.context ?? options.context) as TContext;
      const signal = combineAbortSignals([callOptions?.signal]);
      const erased = options as LocalOptions<TContext>;
      const level = resolveLocalDisclosure(
        erased,
        principal,
        DISPATCHER_DEFAULT_DISCLOSURE,
      );

      if (route === undefined || handler === undefined) {
        return missingOperation(operation, options.origin, level);
      }

      return ResultAsync.fromPromise(
        authorizeAndAdmit(erased, operation, args, principal, context, signal),
        internalFromThrown,
      )
        .andThen((result) => result)
        .andThen((release) =>
          invokeRoute(
            route,
            handler,
            args,
            context,
            principal,
            signal,
            options.origin,
            level,
          )
            .andTee(() => {
              release();
            })
            .orTee(() => {
              release();
            }),
        )
        .mapErr((error) => discloseLocal(error, options.origin, level));
    },
  };
}

/**
 * Typed module-to-module client. One method per operation, each returning the
 * route's declared output or a `RailError`. Disclosure defaults to `full`.
 */
export function createLocalClient<
  TContract extends ContractDef,
  TContext = undefined,
  TPrincipal = unknown,
>(
  contract: TContract,
  handlers: LocalHandlers<TContract, TContext, TPrincipal>,
  options: LocalOptions<TContext, TPrincipal, TContract> = {},
): LocalClient<TContract, TContext> {
  const dispatcher = createDispatcher(contract, handlers, {
    ...options,
    disclosure:
      options.policy !== undefined
        ? options.disclosure
        : (options.disclosure ?? LOCAL_CLIENT_DEFAULT_DISCLOSURE),
  });
  const client: Record<
    string,
    (
      args: unknown,
      callOptions?: { context?: TContext; principal?: unknown; signal?: AbortSignal },
    ) => ResultAsync<unknown, RailError<string>>
  > = {};

  for (const operation of dispatcher.operations) {
    client[operation] = (args, callOptions) =>
      dispatcher.dispatch(
        operation,
        args,
        callOptions as LocalCallOptions<TContext, TPrincipal>,
      );
  }

  return client as LocalClient<TContract, TContext>;
}
