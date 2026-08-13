import { createClient } from '../client/create.js';
import type { Client } from '../client/types.js';
import type { ContractDef } from '../contract/types.js';
import type { Disclosure } from '../disclose.js';
import { serve, type Handlers } from '../server/index.js';

const DEFAULT_BASE_URL = 'http://never-rest.test';

export interface CreateTestClientOptions<TContext> {
  readonly context?: TContext;
  readonly baseUrl?: string;
  readonly basePath?: `/${string}`;
  readonly headers?: HeadersInit;
  readonly disclosure?: Disclosure;
}

/** Typed in-process client that routes through the real `serve` handler. */
export function createTestClient<TContract extends ContractDef, TContext>(
  contract: TContract,
  handlers: Handlers<TContract, TContext>,
  options?: CreateTestClientOptions<TContext>,
): Client<TContract> {
  const basePath = options?.basePath;
  const baseUrlWithoutPath = options?.baseUrl ?? DEFAULT_BASE_URL;
  const clientBaseUrl =
    basePath !== undefined
      ? `${baseUrlWithoutPath.replace(/\/$/, '')}${basePath}`
      : baseUrlWithoutPath;

  const handler = serve(contract, handlers, {
    disclosure: options?.disclosure,
    basePath,
  });

  const context = options?.context as TContext;

  return createClient(contract, {
    baseUrl: clientBaseUrl,
    headers: options?.headers,
    fetch: (input, init) =>
      handler(new Request(input, init), context),
  });
}
