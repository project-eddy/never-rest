import type { Result, ResultAsync } from 'neverthrow';
import type { BoundaryErrorCode } from '../boundary.js';
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
import type { AdmissionOptions } from '../limits/types.js';
import type { Policy } from '../policy/types.js';

/**
 * Codes local dispatch raises on its own behalf, mirroring the served host
 * codes. Declared here rather than imported from `../server` so this module
 * stays free of the HTTP layer.
 */
export type LocalHostErrorCode =
  | 'validation_error'
  | 'internal'
  | 'route_not_found'
  | BoundaryErrorCode;

export interface LocalCallOptions<TContext, TPrincipal = unknown> {
  readonly context?: TContext;
  readonly principal?: TPrincipal;
  readonly signal?: AbortSignal;
}

export interface LocalOptions<
  TContext,
  TPrincipal = unknown,
  TContract extends ContractDef = ContractDef,
> {
  /** Bound context, used when a call supplies none. */
  readonly context?: TContext;
  readonly origin?: string;
  /**
   * Module-to-module clients default to `full`. `createDispatcher` defaults
   * to `public` because it serves foreign transports.
   */
  readonly disclosure?: Disclosure;
  readonly policy?: Policy<TContract, TPrincipal>;
  readonly admission?: AdmissionOptions<TPrincipal>;
}

/**
 * A handler with no `request`. Assignable to `Handler`, so the same function
 * mounts under `serve` or through local dispatch without changing shape.
 */
export type LocalHandler<TRoute extends RouteDef, TContext, TPrincipal = unknown> = (
  args: HandlerArgsOf<TRoute> & {
    readonly context: TContext;
    readonly principal: TPrincipal | undefined;
    readonly signal: AbortSignal;
  },
) =>
  | Result<OutputOf<TRoute>, ErrorOf<TRoute>>
  | ResultAsync<OutputOf<TRoute>, ErrorOf<TRoute>>
  | Promise<Result<OutputOf<TRoute>, ErrorOf<TRoute>>>;

export type LocalHandlers<
  TContract extends ContractDef,
  TContext,
  TPrincipal = unknown,
> = {
  readonly [K in keyof TContract]: LocalHandler<
    TContract[K],
    TContext,
    TPrincipal
  >;
};

/** Declared route errors plus the codes local dispatch can add. */
export type LocalErrorOf<TRoute extends RouteDef> =
  | ErrorOf<TRoute>
  | RailError<LocalHostErrorCode>;

export type LocalClient<TContract extends ContractDef, TContext = unknown> = {
  readonly [K in keyof TContract]: (
    args: ClientArgsOf<TContract[K]>,
    options?: LocalCallOptions<TContext>,
  ) => ResultAsync<OutputOf<TContract[K]>, LocalErrorOf<TContract[K]>>;
};

export interface LocalDispatcher<
  TContract extends ContractDef,
  TContext,
  TPrincipal = unknown,
> {
  readonly operations: readonly (keyof TContract & string)[];
  /**
   * Operation-addressed entry point for foreign transports — NDJSON sockets,
   * MCP stdio, agent tool calls — where the operation arrives as a string.
   */
  dispatch(
    operation: string,
    args: unknown,
    options?: LocalCallOptions<TContext, TPrincipal>,
  ): ResultAsync<unknown, RailError<string>>;
}
