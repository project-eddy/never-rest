import type { ResultAsync } from 'neverthrow';

import type {
  ClientArgsOf,
  ClientErrorOf,
  ContractDef,
  OutputOf,
  RouteDef,
} from '../contract/types.js';

export interface ClientOptions {
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
  readonly headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  readonly credentials?: RequestCredentials;
}

type ClientMethod<TRoute extends RouteDef> = [keyof ClientArgsOf<TRoute>] extends [never]
  ? () => ResultAsync<OutputOf<TRoute>, ClientErrorOf<TRoute>>
  : (
      args: ClientArgsOf<TRoute>,
    ) => ResultAsync<OutputOf<TRoute>, ClientErrorOf<TRoute>>;

/**
 * One mapped type over the contract, one level deep, resolving to a plain function type per
 * operation. No recursion, no conditional chains beyond the empty-args branch.
 */
export type Client<TContract extends ContractDef> = {
  readonly [K in keyof TContract]: ClientMethod<TContract[K]>;
};
