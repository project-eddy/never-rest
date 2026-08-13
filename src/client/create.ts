import { errAsync, okAsync, ResultAsync } from 'neverthrow';

import { compileContract } from '../contract/compile.js';
import { parseRouteSources } from '../contract/parse.js';
import type { CompiledPath } from '../contract/path.js';
import type {
  ClientArgsOf,
  ClientErrorOf,
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

function headersInitToRecord(headers: HeadersInit): Record<string, string> {
  const merged = new Headers(headers);
  const record: Record<string, string> = {};
  merged.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

function mergeHeadersInit(
  globalHeaders: HeadersInit | undefined,
  perCallHeaders: Record<string, string> | undefined,
): ResultAsync<HeadersInit, ClientErrorOf<RouteDef>> {
  try {
    const merged = new Headers(globalHeaders);
    if (perCallHeaders !== undefined) {
      for (const [key, value] of Object.entries(perCallHeaders)) {
        merged.set(key, value);
      }
    }
    return okAsync(merged);
  } catch {
    return errAsync(internalError('Request headers are invalid'));
  }
}

function toRawSources(
  args: ClientArgsOf<RouteDef>,
  headersForValidation?: unknown,
) {
  const record = args as {
    readonly params?: Record<string, string>;
    readonly query?: unknown;
    readonly body?: unknown;
  };
  return {
    ...(record.params !== undefined ? { params: record.params } : {}),
    ...(record.query !== undefined ? { query: record.query } : {}),
    ...(record.body !== undefined ? { body: record.body } : {}),
    ...(headersForValidation !== undefined ? { headers: headersForValidation } : {}),
  };
}

function headersForValidation(
  route: RouteDef,
  globalHeaders: HeadersInit | undefined,
  args: ClientArgsOf<RouteDef>,
): ResultAsync<unknown, ClientErrorOf<RouteDef>> {
  if (route.headers === undefined) {
    return okAsync(undefined);
  }

  try {
    const perCallHeaders = (args as { readonly headers?: Record<string, string> })
      .headers;
    const globalRecord =
      globalHeaders !== undefined ? headersInitToRecord(globalHeaders) : {};
    return okAsync({ ...globalRecord, ...perCallHeaders });
  } catch {
    return errAsync(internalError('Request headers are invalid'));
  }
}

function callRoute<TRoute extends RouteDef>(
  route: TRoute,
  compiledPath: CompiledPath,
  options: ClientOptions,
  fetchFn: typeof fetch,
  args: ClientArgsOf<TRoute>,
): ResultAsync<OutputOf<TRoute>, ClientErrorOf<TRoute>> {
  return resolveHeaders(options.headers).andThen((globalHeaders) =>
    mergeHeadersInit(
      globalHeaders,
      (args as { readonly headers?: Record<string, string> }).headers,
    ).andThen((wireHeaders) =>
      headersForValidation(route, globalHeaders, args).andThen(
        (headersForParse) =>
          parseRouteSources(route, toRawSources(args, headersForParse)).andThen(
            () => {
              const built = buildRequest(
                route,
                compiledPath,
                options.baseUrl,
                args,
                wireHeaders,
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
            },
          ),
      ),
    ),
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
    client[key] = (args?: ClientArgsOf<typeof route>) =>
      callRoute(
        route,
        compiledPath,
        options,
        fetchFn,
        (args ?? {}) as ClientArgsOf<typeof route>,
      );
  }

  return client as Client<TContract>;
}
