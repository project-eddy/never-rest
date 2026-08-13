import type { StandardSchemaV1 } from '@standard-schema/spec';
import { z } from 'zod';
import type { RailError } from '../error.js';
import type {
  ClientArgsOf,
  ClientErrorOf,
  ContractDef,
  ErrorOf,
  HandlerArgsOf,
  OutputOf,
  RouteDef,
} from './types.js';

type ValidContract = {
  getUser: {
    method: 'GET';
    path: '/users/:id';
    params: StandardSchemaV1;
    output: StandardSchemaV1;
    errors: { readonly not_found: 404 };
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

type NoOutputWithout204Route = {
  method: 'GET';
  path: '/users/:id';
  errors: { readonly not_found: 404 };
};

type NoOutputWith204Route = {
  method: 'DELETE';
  path: '/users/:id';
  success: 204;
  errors: { readonly not_found: 404 };
};

type UnknownMethodRoute = {
  method: 'HEAD';
  path: '/users/:id';
  output: StandardSchemaV1;
  errors: { readonly not_found: 404 };
};

type InvalidErrorsRoute = {
  method: 'GET';
  path: '/users/:id';
  output: StandardSchemaV1;
  errors: readonly ['not_found'];
};

type _AllowsMissingOutputAtTypeLevel = Expect<
  NoOutputWithout204Route extends RouteDef ? true : false
>;

type _Allows204WithoutOutput = Expect<
  NoOutputWith204Route extends RouteDef ? true : false
>;

type _RejectsUnknownMethod = Expect<
  UnknownMethodRoute extends RouteDef ? false : true
>;

type _RejectsInvalidErrors = Expect<
  InvalidErrorsRoute extends RouteDef ? false : true
>;

const _paramsSchema = z.object({ id: z.string() });
const _queryTransform = z.object({ limit: z.string().transform(Number) });
const _bodySchema = z.object({ name: z.string().min(1) });
const _headersSchema = z.object({ 'x-request-id': z.string() });

type GetUserRoute = {
  method: 'GET';
  path: '/users/:id';
  params: typeof _paramsSchema;
  output: StandardSchemaV1;
  errors: { readonly not_found: 404 };
};

type CreateUserRoute = {
  method: 'POST';
  path: '/users';
  body: typeof _bodySchema;
  output: StandardSchemaV1;
  errors: { readonly conflict: 409 };
};

type SearchRoute = {
  method: 'GET';
  path: '/search';
  query: typeof _queryTransform;
  output: StandardSchemaV1;
  errors: { readonly [code: string]: number };
};

type ListRoute = {
  method: 'GET';
  path: '/users';
  output: StandardSchemaV1;
  errors: { readonly [code: string]: number };
};

type HeadersRoute = {
  method: 'GET';
  path: '/trace';
  headers: typeof _headersSchema;
  output: StandardSchemaV1;
  errors: { readonly [code: string]: number };
};

type DeleteUserRoute = {
  method: 'DELETE';
  path: '/users/:id';
  success: 204;
  errors: { readonly not_found: 404 };
};

type _GetUserClientArgs = Expect<
  ClientArgsOf<GetUserRoute> extends { readonly params: { id: string } }
    ? true
    : false
>;

type _CreateUserClientArgs = Expect<
  ClientArgsOf<CreateUserRoute> extends { readonly body: { name: string } }
    ? true
    : false
>;

type _SearchClientQueryIsString = Expect<
  ClientArgsOf<SearchRoute> extends { readonly query: { limit: string } }
    ? true
    : false
>;

type _SearchHandlerQueryIsNumber = Expect<
  HandlerArgsOf<SearchRoute> extends { readonly query: { limit: number } }
    ? true
    : false
>;

type _HeadersClientArgs = Expect<
  ClientArgsOf<HeadersRoute> extends {
    readonly headers: { 'x-request-id': string };
  }
    ? true
    : false
>;

type _HeadersHandlerArgs = Expect<
  HandlerArgsOf<HeadersRoute> extends {
    readonly headers: { 'x-request-id': string };
  }
    ? true
    : false
>;

type _ListClientArgsEmpty = Expect<
  keyof ClientArgsOf<ListRoute> extends never ? true : false
>;

type _ListHandlerArgsEmpty = Expect<
  keyof HandlerArgsOf<ListRoute> extends never ? true : false
>;

type _DeleteOutputIsVoid = Expect<
  OutputOf<DeleteUserRoute> extends void ? true : false
>;
