import type { Result, ResultAsync } from 'neverthrow';
import type {
  ClientArgsOf,
  ContractDef,
  ErrorOf,
  HandlerArgsOf,
  OutputOf,
  RouteDef,
} from '../contract/types.js';
import type { Disclosure } from '../disclose.js';
import type { RailError } from '../error.js';

/**
 * Codes local dispatch raises on its own behalf, mirroring the served host
 * codes. Declared here rather than imported from `../server` so this module
 * stays free of the HTTP layer.
 */
export type LocalHostErrorCode =
  | 'validation_error'
  | 'internal'
  | 'route_not_found';

export interface LocalOptions<TContext> {
  /** Bound context, used when a call supplies none. */
  readonly context?: TContext;
  readonly origin?: string;
  /** In-process callers share a trust circle; defaults to `full`. */
  readonly disclosure?: Disclosure;
}

/**
 * A handler with no `request`. Assignable to `Handler`, so the same function
 * mounts under `serve` or through local dispatch without changing shape.
 */
export type LocalHandler<TRoute extends RouteDef, TContext> = (
  args: HandlerArgsOf<TRoute> & { readonly context: TContext },
) =>
  | Result<OutputOf<TRoute>, ErrorOf<TRoute>>
  | ResultAsync<OutputOf<TRoute>, ErrorOf<TRoute>>
  | Promise<Result<OutputOf<TRoute>, ErrorOf<TRoute>>>;

export type LocalHandlers<TContract extends ContractDef, TContext> = {
  readonly [K in keyof TContract]: LocalHandler<TContract[K], TContext>;
};

/** Declared route errors plus the codes local dispatch can add. */
export type LocalErrorOf<TRoute extends RouteDef> =
  | ErrorOf<TRoute>
  | RailError<LocalHostErrorCode>;

export type LocalClient<TContract extends ContractDef> = {
  readonly [K in keyof TContract]: (
    args: ClientArgsOf<TContract[K]>,
  ) => ResultAsync<OutputOf<TContract[K]>, LocalErrorOf<TContract[K]>>;
};

export interface LocalDispatcher<TContract extends ContractDef, TContext> {
  readonly operations: readonly (keyof TContract & string)[];
  /**
   * Operation-addressed entry point for foreign transports — NDJSON sockets,
   * MCP stdio, agent tool calls — where the operation arrives as a string.
   */
  dispatch(
    operation: string,
    args: unknown,
    context?: TContext,
  ): ResultAsync<unknown, RailError<string>>;
}
