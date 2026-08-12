import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { RailError } from '../error.js';

export interface RouteDef {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly params?: StandardSchemaV1;
  readonly query?: StandardSchemaV1;
  readonly body?: StandardSchemaV1;
  readonly output: StandardSchemaV1;
  readonly errors: readonly string[];
  readonly summary?: string;
}

export interface ContractDef {
  readonly [operation: string]: RouteDef;
}

type SourceInput<S> = S extends StandardSchemaV1
  ? StandardSchemaV1.InferInput<S>
  : never;

type SourceOutput<S> = S extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<S>
  : never;

/** Wire-shaped client args from declared params / query / body schemas. */
export type ClientArgsOf<TRoute extends RouteDef> = (TRoute['params'] extends StandardSchemaV1
  ? { readonly params: SourceInput<TRoute['params']> }
  : // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- empty intersection arm
    {}) &
  (TRoute['query'] extends StandardSchemaV1
    ? { readonly query: SourceInput<TRoute['query']> }
    : // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- empty intersection arm
      {}) &
  (TRoute['body'] extends StandardSchemaV1
    ? { readonly body: SourceInput<TRoute['body']> }
    : // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- empty intersection arm
      {});

/** Handler-parsed args after each source schema runs. */
export type HandlerArgsOf<TRoute extends RouteDef> = (TRoute['params'] extends StandardSchemaV1
  ? { readonly params: SourceOutput<TRoute['params']> }
  : // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- empty intersection arm
    {}) &
  (TRoute['query'] extends StandardSchemaV1
    ? { readonly query: SourceOutput<TRoute['query']> }
    : // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- empty intersection arm
      {}) &
  (TRoute['body'] extends StandardSchemaV1
    ? { readonly body: SourceOutput<TRoute['body']> }
    : // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- empty intersection arm
      {});

export type OutputOf<TRoute extends RouteDef> = StandardSchemaV1.InferOutput<
  TRoute['output']
>;

export type ErrorOf<TRoute extends RouteDef> = RailError<TRoute['errors'][number]>;

export type ServerSystemErrorCode =
  | 'validation_error'
  | 'internal';

export type ClientSystemErrorCode =
  | ServerSystemErrorCode
  | 'unavailable';

export type ServerErrorOf<TRoute extends RouteDef> =
  | ErrorOf<TRoute>
  | RailError<ServerSystemErrorCode>;

export type ClientErrorOf<TRoute extends RouteDef> =
  | ServerErrorOf<TRoute>
  | RailError<'unavailable'>;
