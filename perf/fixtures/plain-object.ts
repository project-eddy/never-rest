/**
 * Plain-object control fixture shape.
 *
 * Benches use inline literals (no `satisfies ContractDef`, no mapped `Client` /
 * `Handlers`) so attest measures schema-inference cost without never-rest's
 * contract checking. Route entries are generated inside each isolated bench file
 * — see `perf/generate-benches.mjs`.
 */
export interface PlainRouteDef {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly input?: import('@standard-schema/spec').StandardSchemaV1;
  readonly output: import('@standard-schema/spec').StandardSchemaV1;
  readonly errors: readonly string[];
}

export interface PlainContract {
  readonly [operation: string]: PlainRouteDef;
}
