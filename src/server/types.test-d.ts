import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { ContractDef } from '../contract/types.js';
import type { ServeStatusMap } from './types.js';

type Expect<T extends true> = T;
type ExpectNot<T extends false> = T;

type TestContract = {
  getUser: {
    method: 'GET';
    path: '/users/:id';
    output: StandardSchemaV1;
    errors: readonly ['not_found', 'conflict'];
  };
};

type _ValidContract = TestContract extends ContractDef ? true : never;

type FullStatusMap = ServeStatusMap<TestContract>;

type _RequiresDomainCodes = Expect<
  FullStatusMap extends {
    not_found: number;
    conflict: number;
    validation_error: number;
    internal: number;
    route_not_found: number;
  }
    ? true
    : false
>;

type IncompleteStatusMap = {
  validation_error: 400;
  internal: 500;
  route_not_found: 404;
  not_found: 404;
};

type _RejectsMissingDomainCode = ExpectNot<
  IncompleteStatusMap extends ServeStatusMap<TestContract> ? true : false
>;
