import { errAsync, ResultAsync } from 'neverthrow';

import { compileContract } from '../contract/compile.js';
import { parseInput } from '../contract/parse.js';
import type { CompiledPath } from '../contract/path.js';
import type {
  ClientErrorOf,
  ClientInputOf,
  ContractDef,
  OutputOf,
  RouteDef,
} from '../contract/types.js';
import { railError } from '../error.js';
import { buildRequest } from './request.js';
import { mapResponse } from './response.js';
import type { Client, ClientOptions } from './types.js';

function unavailableError() {
  return railError('unavailable', 'Network request failed', { retryable: true });
}

function internalError(message: string) {
  return railError('internal', message);
}

function resolveHeaders(
  headers: ClientOptions['headers'],
): ResultAsync<HeadersInit | undefined, ClientErrorOf<RouteDef>> {
  if (headers === undefined) {
    return ResultAsync.fromSafePromise(Promise.resolve(undefined));
  }

  if (typeof headers === 'function') {
    try {
      const result = headers();
      return ResultAsync.fromPromise(Promise.resolve(result), () =>
        unavailableError(),
      );
    } catch {
      return errAsync(internalError('Request headers callback failed'));
    }
  }

  try {
    return ResultAsync.fromSafePromise(Promise.resolve(headers));
  } catch {
    return errAsync(internalError('Request headers are invalid'));
  }
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
  compiledPath: CompiledPath,
  options: ClientOptions,
  fetchFn: typeof fetch,
  input: ClientInputOf<TRoute>,
): ResultAsync<OutputOf<TRoute>, ClientErrorOf<TRoute>> {
  return parseInput(route, input).andThen(() =>
    resolveHeaders(options.headers).andThen((headers) => {
      const built = buildRequest(
        route,
        compiledPath,
        options.baseUrl,
        input,
        headers,
        options.credentials,
      );
      if (built.isErr()) {
        return errAsync(built.error as ClientErrorOf<TRoute>);
      }
      const { url, init } = built.value;
      return ResultAsync.fromPromise(
        invokeFetch(fetchFn, url, init),
        () => unavailableError(),
      ).andThen((response) => mapResponse(route, response));
    }),
  );
}

/** Build a typed client with one composable ResultAsync function per contract operation. */
export function createClient<TContract extends ContractDef>(
  contract: TContract,
  options: ClientOptions,
): Client<TContract> {
  const compiled = compileContract(contract);
  const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
  const client: Record<string, unknown> = {};

  for (const key of Object.keys(contract) as (keyof TContract & string)[]) {
    const route = contract[key];
    const compiledPath = compiled.routes[key].compiledPath;
    client[key] = (input: ClientInputOf<typeof route>) =>
      callRoute(route, compiledPath, options, fetchFn, input);
  }

  return client as Client<TContract>;
}
