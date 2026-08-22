import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { ContractDef } from '../contract/types.js';
import type { Handler } from '../server/serve.js';
import type { ServerHostErrorCode } from '../server/types.js';
import type {
  LocalClient,
  LocalHandler,
  LocalHostErrorCode,
  LocalOptions,
} from './types.js';

type Expect<T extends true> = T;

type TestRoute = {
  method: 'GET';
  path: '/claims/:zone';
  output: StandardSchemaV1;
  errors: { readonly not_found: 404 };
};

type TestContract = { getClaim: TestRoute };

type Context = { readonly agent: string };

type _ValidContract = Expect<TestContract extends ContractDef ? true : false>;

/**
 * The load-bearing claim: a handler written for local dispatch also satisfies
 * `Handler`, so the same function mounts under `serve` with no change.
 */
type _LocalHandlerMountsUnderServe = Expect<
  LocalHandler<TestRoute, Context> extends Handler<TestRoute, Context>
    ? true
    : false
>;

/** Guards the deliberate duplication of the host code union. */
type _HostCodesMatchServer = Expect<
  LocalHostErrorCode extends ServerHostErrorCode
    ? ServerHostErrorCode extends LocalHostErrorCode
      ? true
      : false
    : false
>;

type _OptionsCarryTrustCircleControls = Expect<
  LocalOptions<Context> extends {
    context?: Context;
    origin?: string;
    disclosure?: 'full' | 'internal' | 'public';
  }
    ? true
    : false
>;

/** Local dispatch owns no HTTP status concerns. */
type _OptionsHaveNoStatuses = Expect<
  'hostStatuses' extends keyof LocalOptions<Context> ? false : true
>;

type _ClientExposesOneMethodPerOperation = Expect<
  keyof LocalClient<TestContract> extends 'getClaim' ? true : false
>;
