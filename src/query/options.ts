import type { Result, ResultAsync } from 'neverthrow';
import { err } from 'neverthrow';

import type { Client } from '../client/types.js';
import type {
  ClientArgsOf,
  ClientErrorOf,
  ContractDef,
  OutputOf,
  RouteDef,
} from '../contract/types.js';
import { railError } from '../error.js';

const QUERY_KEY_ROOT = 'never-rest' as const;

/** Stable cache key for an operation and its wire args. */
export function queryKeyFor(operation: string, args?: unknown): readonly unknown[] {
  return [QUERY_KEY_ROOT, operation, args ?? {}];
}

async function resolveResult<T, E>(resultAsync: ResultAsync<T, E>): Promise<Result<T, E>> {
  try {
    return await resultAsync;
  } catch {
    return err(
      railError('internal', 'Unexpected rejection in query adapter') as E,
    );
  }
}

function callClient<TRoute extends RouteDef>(
  clientMethod: (
    args?: ClientArgsOf<TRoute>,
  ) => ResultAsync<OutputOf<TRoute>, ClientErrorOf<TRoute>>,
  args?: ClientArgsOf<TRoute>,
): Promise<Result<OutputOf<TRoute>, ClientErrorOf<TRoute>>> {
  return resolveResult(clientMethod(args));
}

/**
 * Result-preserving query options for cache layers (structurally compatible with
 * TanStack Query). Each `queryFn` resolves with a `Result` and never rejects, so
 * the railway survives the cache boundary.
 *
 * TanStack's `isError` will not fire for domain failures: errors arrive as fulfilled
 * `Err` data. Branch on `data.isOk()` / `data.isErr()` (or `match`) instead.
 */
export function createQueryOptions<TContract extends ContractDef>(
  client: Client<TContract>,
): {
  readonly [K in keyof TContract]: (args?: ClientArgsOf<TContract[K]>) => {
    readonly queryKey: readonly unknown[];
    readonly queryFn: () => Promise<
      Result<OutputOf<TContract[K]>, ClientErrorOf<TContract[K]>>
    >;
  };
} {
  const options: Record<string, unknown> = {};

  for (const key of Object.keys(client) as (keyof TContract & string)[]) {
    const clientMethod = client[key];
    options[key] = (args?: ClientArgsOf<TContract[typeof key]>) => ({
      queryKey: queryKeyFor(key, args),
      queryFn: () =>
        callClient(
          clientMethod as (
            args?: ClientArgsOf<RouteDef>,
          ) => ResultAsync<OutputOf<RouteDef>, ClientErrorOf<RouteDef>>,
          args as ClientArgsOf<RouteDef> | undefined,
        ) as Promise<
          Result<OutputOf<TContract[typeof key]>, ClientErrorOf<TContract[typeof key]>>
        >,
    });
  }

  return options as {
    readonly [K in keyof TContract]: (args?: ClientArgsOf<TContract[K]>) => {
      readonly queryKey: readonly unknown[];
      readonly queryFn: () => Promise<
        Result<OutputOf<TContract[K]>, ClientErrorOf<TContract[K]>>
      >;
    };
  };
}

/**
 * Result-preserving mutation options for cache layers (structurally compatible with
 * TanStack Query). Each `mutationFn` resolves with a `Result` and never rejects.
 *
 * TanStack's `isError` will not fire for domain failures: errors arrive as fulfilled
 * `Err` data. Branch on the returned `Result` instead.
 */
export function createMutationOptions<TContract extends ContractDef>(
  client: Client<TContract>,
): {
  readonly [K in keyof TContract]: () => {
    readonly mutationFn: (
      args?: ClientArgsOf<TContract[K]>,
    ) => Promise<Result<OutputOf<TContract[K]>, ClientErrorOf<TContract[K]>>>;
  };
} {
  const options: Record<string, unknown> = {};

  for (const key of Object.keys(client) as (keyof TContract & string)[]) {
    const clientMethod = client[key];
    options[key] = () => ({
      mutationFn: (args?: ClientArgsOf<TContract[typeof key]>) =>
        callClient(
          clientMethod as (
            args?: ClientArgsOf<RouteDef>,
          ) => ResultAsync<OutputOf<RouteDef>, ClientErrorOf<RouteDef>>,
          args as ClientArgsOf<RouteDef> | undefined,
        ) as Promise<
          Result<OutputOf<TContract[typeof key]>, ClientErrorOf<TContract[typeof key]>>
        >,
    });
  }

  return options as {
    readonly [K in keyof TContract]: () => {
      readonly mutationFn: (
        args?: ClientArgsOf<TContract[K]>,
      ) => Promise<Result<OutputOf<TContract[K]>, ClientErrorOf<TContract[K]>>>;
    };
  };
}
