import { createClient } from '../client/create.js';
import type { Client } from '../client/types.js';
import type { ContractDef } from '../contract/types.js';
import type { Disclosure } from '../disclose.js';
import type { AdmissionOptions } from '../limits/types.js';
import type { Policy } from '../policy/types.js';
import { serve, type Handlers } from '../server/index.js';
import type {
  ServeLimits,
  ServeOptions,
  ServeTimeouts,
} from '../server/types.js';

const DEFAULT_BASE_URL = 'http://never-rest.test';

function testClientBaseUrl(options?: {
  readonly baseUrl?: string;
  readonly basePath?: `/${string}`;
}): string {
  const basePath = options?.basePath;
  const origin = options?.baseUrl ?? DEFAULT_BASE_URL;
  if (basePath === undefined) {
    return origin;
  }
  return `${origin.replace(/\/$/, '')}${basePath}`;
}

function testClientServeOptions<TContext, TPrincipal>(
  options: CreateTestClientOptions<TContext, TPrincipal> | undefined,
) {
  return {
    disclosure: options?.disclosure,
    basePath: options?.basePath,
    policy: options?.policy,
    admission: options?.admission,
    limits: options?.limits,
    timeouts: options?.timeouts,
  };
}

export interface CreateTestClientOptions<
  TContext,
  TPrincipal = unknown,
  TContract extends ContractDef = ContractDef,
> {
  readonly context?: TContext;
  readonly baseUrl?: string;
  readonly basePath?: `/${string}`;
  readonly headers?: HeadersInit;
  readonly disclosure?: Disclosure;
  readonly policy?: Policy<TContract, TPrincipal>;
  readonly admission?: AdmissionOptions<TPrincipal>;
  readonly limits?: ServeLimits;
  readonly timeouts?: ServeTimeouts;
}

/** Typed in-process client that routes through the real `serve` handler. */
export function createTestClient<
  TContract extends ContractDef,
  TContext,
  TPrincipal = unknown,
>(
  contract: TContract,
  handlers: Handlers<TContract, TContext, TPrincipal>,
  options?: CreateTestClientOptions<TContext, TPrincipal, TContract>,
): Client<TContract> {
  const handler = serve(
    contract,
    handlers as Handlers<TContract, TContext>,
    testClientServeOptions(options) as ServeOptions<
      TPrincipal,
      TContract
    >,
  );

  const context = options?.context as TContext;

  return createClient(contract, {
    baseUrl: testClientBaseUrl(options),
    headers: options?.headers,
    fetch: (input, init) =>
      handler(new Request(input, init), context),
  });
}
