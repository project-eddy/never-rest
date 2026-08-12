import type { ResultAsync } from 'neverthrow';

import type {
  ClientErrorOf,
  ContractDef,
  InputOf,
  OutputOf,
} from '../contract/types.js';

export interface ClientOptions {
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
  readonly headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  readonly credentials?: RequestCredentials;
}

/**
 * One mapped type over the contract, one level deep, resolving to a plain function type per
 * operation. No recursion, no conditional chains.
 */
export type Client<TContract extends ContractDef> = {
  readonly [K in keyof TContract]: (
    input: InputOf<TContract[K]>,
  ) => ResultAsync<OutputOf<TContract[K]>, ClientErrorOf<TContract[K]>>;
};
