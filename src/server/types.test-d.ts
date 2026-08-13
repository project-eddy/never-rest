import type { ContractDef } from '../contract/types.js';
import type { ServeOptions } from './types.js';

type Expect<T extends true> = T;

type TestContract = {
  getUser: {
    method: 'GET';
    path: '/users/:id';
    output: import('@standard-schema/spec').StandardSchemaV1;
    errors: { readonly not_found: 404; readonly conflict: 409 };
  };
};

type _ValidContract = TestContract extends ContractDef ? true : never;

type _ServeOptionsHasNoStatuses = Expect<
  'statuses' extends keyof ServeOptions ? false : true
>;

type _ServeOptionsHasBasePath = Expect<
  ServeOptions extends { basePath?: `/${string}` } ? true : false
>;

type _ServeOptionsHasHostStatuses = Expect<
  ServeOptions extends {
    hostStatuses?: Partial<{
      validation_error: number;
      internal: number;
      route_not_found: number;
    }>;
  }
    ? true
    : false
>;
