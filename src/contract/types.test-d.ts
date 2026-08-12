import type { StandardSchemaV1 } from '@standard-schema/spec';
import { z } from 'zod';
import type { RailError } from '../error.js';
import type {
  ClientErrorOf,
  ClientInputOf,
  ContractDef,
  ErrorOf,
  HandlerInputOf,
  RouteDef,
} from './types.js';

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

type ExpectNot<T extends false> = T;

type SampleRoute = ValidContract['getUser'];
type SampleClientError = ClientErrorOf<SampleRoute>;
type SampleDomainError = ErrorOf<SampleRoute>;

type _DomainCodeInClient = Expect<
  RailError<'not_found'> extends SampleClientError ? true : false
>;

type _ValidationInClient = Expect<
  RailError<'validation_error'> extends SampleClientError ? true : false
>;

type _InternalInClient = Expect<
  RailError<'internal'> extends SampleClientError ? true : false
>;

type _UnavailableInClient = Expect<
  RailError<'unavailable'> extends SampleClientError ? true : false
>;

type _UndeclaredNotInClient = ExpectNot<
  RailError<'database_corrupt'> extends SampleClientError ? true : false
>;

type _InternalNotInDomain = ExpectNot<
  RailError<'internal'> extends SampleDomainError ? true : false
>;

type _ValidationNotInDomain = ExpectNot<
  RailError<'validation_error'> extends SampleDomainError ? true : false
>;

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

const _transformInput = z.object({ limit: z.string().transform(Number) });

type TransformRoute = {
  method: 'GET';
  path: '/items';
  input: typeof _transformInput;
  output: StandardSchemaV1;
  errors: readonly ['not_found'];
};

type _ClientInputIsString = Expect<
  ClientInputOf<TransformRoute> extends { limit: string } ? true : false
>;

type _HandlerInputIsNumber = Expect<
  HandlerInputOf<TransformRoute> extends { limit: number } ? true : false
>;

type NoInputRoute = {
  method: 'GET';
  path: '/health';
  output: StandardSchemaV1;
  errors: readonly [];
};

type _NoInputClientUndefined = Expect<
  ClientInputOf<NoInputRoute> extends undefined ? true : false
>;

type _NoInputHandlerUndefined = Expect<
  HandlerInputOf<NoInputRoute> extends undefined ? true : false
>;
