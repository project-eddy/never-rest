import { ResultAsync } from 'neverthrow';

import { parseInput } from '../contract/parse.js';
import type { ContractDef, ErrorOf, InputOf, OutputOf, RouteDef } from '../contract/types.js';
import { railError } from '../error.js';
import { buildRequest } from './request.js';
import { mapResponse } from './response.js';
import type { Client, ClientOptions } from './types.js';

function unavailableError() {
  return railError('unavailable', 'Network request failed', { retryable: true });
}

function resolveHeaders(
  headers: ClientOptions['headers'],
): Promise<HeadersInit | undefined> {
  if (headers === undefined) {
    return Promise.resolve(undefined);
  }
  if (typeof headers === 'function') {
    return Promise.resolve(headers());
  }
  return Promise.resolve(headers);
}

function invokeFetch(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    try {
      Promise.resolve(fetchFn(url, init)).then(resolve, reject);
    } catch (error) {
      reject(error);
    }
  });
}

function callRoute<TRoute extends RouteDef>(
  route: TRoute,
  options: ClientOptions,
  fetchFn: typeof fetch,
  input: InputOf<TRoute>,
): ResultAsync<OutputOf<TRoute>, ErrorOf<TRoute>> {
  return parseInput(route, input).andThen((validated) =>
    ResultAsync.fromPromise(resolveHeaders(options.headers), () =>
      unavailableError(),
    ).andThen((headers) => {
      const { url, init } = buildRequest(
        route,
        options.baseUrl,
        validated,
        headers,
        options.credentials,
      );
      return ResultAsync.fromPromise(
        invokeFetch(fetchFn, url, init),
        () => unavailableError(),
      ).andThen((response) => mapResponse(route, response));
    }),
  ) as ResultAsync<OutputOf<TRoute>, ErrorOf<TRoute>>;
}

/** Build a typed client with one composable ResultAsync function per contract operation. */
export function createClient<TContract extends ContractDef>(
  contract: TContract,
  options: ClientOptions,
): Client<TContract> {
  const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
  const client: Record<string, unknown> = {};

  for (const key of Object.keys(contract) as (keyof TContract & string)[]) {
    const route = contract[key];
    client[key] = (input: InputOf<typeof route>) =>
      callRoute(route, options, fetchFn, input);
  }

  return client as Client<TContract>;
}
