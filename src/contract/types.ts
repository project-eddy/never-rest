import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { RailError } from '../error.js';

export interface RouteDef {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly params?: StandardSchemaV1;
  readonly query?: StandardSchemaV1;
  readonly body?: StandardSchemaV1;
  readonly headers?: StandardSchemaV1;
  /** Omitted only when success is 204. */
  readonly output?: StandardSchemaV1;
  /** Success status for this route. Defaults to 200. */
  readonly success?: number;
  /** Domain error code to HTTP status. Replaces the string array and ServeStatusMap. */
  readonly errors: { readonly [code: string]: number };
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

/** Wire-shaped client args from declared params / query / body / headers schemas. */
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
      {}) &
  (TRoute['headers'] extends StandardSchemaV1
    ? { readonly headers: SourceInput<TRoute['headers']> }
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
      {}) &
  (TRoute['headers'] extends StandardSchemaV1
    ? { readonly headers: SourceOutput<TRoute['headers']> }
    : // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- empty intersection arm
      {});

export type OutputOf<TRoute extends RouteDef> =
  TRoute['output'] extends StandardSchemaV1
    ? StandardSchemaV1.InferOutput<TRoute['output']>
    : void;

export type ErrorOf<TRoute extends RouteDef> = RailError<
  keyof TRoute['errors'] & string
>;

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
