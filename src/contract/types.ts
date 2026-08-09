import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { RailError } from '../error.js';

export interface RouteDef {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly input?: StandardSchemaV1;
  readonly output: StandardSchemaV1;
  readonly errors: readonly string[];
  readonly summary?: string;
}

export interface ContractDef {
  readonly [operation: string]: RouteDef;
}

export type InputOf<TRoute extends RouteDef> =
  TRoute['input'] extends StandardSchemaV1
    ? StandardSchemaV1.InferOutput<TRoute['input']>
    : undefined;

export type OutputOf<TRoute extends RouteDef> = StandardSchemaV1.InferOutput<
  TRoute['output']
>;

export type ErrorOf<TRoute extends RouteDef> = RailError<TRoute['errors'][number]>;
