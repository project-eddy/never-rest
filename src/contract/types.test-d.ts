import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { ContractDef, ErrorOf, RouteDef } from './types.js';

type ValidContract = {
  getUser: {
    method: 'GET';
    path: '/users/:id';
    output: StandardSchemaV1;
    errors: readonly ['not_found'];
  };
};

type _ValidContract = ValidContract extends ContractDef ? true : never;

type _ValidRoute = ValidContract['getUser'] extends RouteDef ? true : never;

type _GetUserError = ErrorOf<ValidContract['getUser']>;

/** Expect helper — assignment fails when the condition is false. */
type Expect<T extends true> = T;

type MissingOutputRoute = {
  method: 'GET';
  path: '/users/:id';
  errors: readonly ['not_found'];
};

type UnknownMethodRoute = {
  method: 'HEAD';
  path: '/users/:id';
  output: StandardSchemaV1;
  errors: readonly ['not_found'];
};

type InvalidErrorsRoute = {
  method: 'GET';
  path: '/users/:id';
  output: StandardSchemaV1;
  errors: readonly [404];
};

type _RejectsMissingOutput = Expect<
  MissingOutputRoute extends RouteDef ? false : true
>;

type _RejectsUnknownMethod = Expect<
  UnknownMethodRoute extends RouteDef ? false : true
>;

type _RejectsInvalidErrors = Expect<
  InvalidErrorsRoute extends RouteDef ? false : true
>;
