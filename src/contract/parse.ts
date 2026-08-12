import type { StandardSchemaV1 } from '@standard-schema/spec';
import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import { railError, type RailError, type RailIssue } from '../error.js';
import type { HandlerArgsOf, OutputOf, RouteDef } from './types.js';

/** Failure from schema validation before error-code mapping. */
export interface SchemaFailure {
  readonly issues: readonly RailIssue[];
}

/** Raw wire values before per-source schema parse. */
export interface RawRouteSources {
  readonly params?: Record<string, string>;
  readonly query?: unknown;
  readonly body?: unknown;
}

function toPathSegment(
  segment: PropertyKey | StandardSchemaV1.PathSegment,
): string | number {
  if (typeof segment === 'object' && segment !== null && 'key' in segment) {
    const key = segment.key;
    if (typeof key === 'string' || typeof key === 'number') {
      return key;
    }
    return String(key);
  }
  if (typeof segment === 'string' || typeof segment === 'number') {
    return segment;
  }
  return String(segment);
}

function mapIssue(issue: StandardSchemaV1.Issue): RailIssue {
  const path = issue.path?.map(toPathSegment) ?? [];
  return { path, message: issue.message };
}

function schemaFailure(issues: readonly RailIssue[]): SchemaFailure {
  return { issues };
}

function validationError(issues: readonly RailIssue[]): RailError<'validation_error'> {
  return railError('validation_error', 'Validation failed', { issues });
}

function toParsedResult<Output>(
  result: StandardSchemaV1.Result<Output>,
): ResultAsync<Output, SchemaFailure> {
  if (result.issues !== undefined && result.issues.length > 0) {
    return errAsync(schemaFailure(result.issues.map(mapIssue)));
  }
  if ('value' in result) {
    return okAsync(result.value);
  }
  return errAsync(schemaFailure([{ path: [], message: 'Validation failed' }]));
}

/** Validate a value through any Standard Schema validator. */
export function parseSchema<Output>(
  schema: StandardSchemaV1<unknown, Output>,
  value: unknown,
): ResultAsync<Output, SchemaFailure> {
  try {
    const outcome = schema['~standard'].validate(value);
    if (outcome instanceof Promise) {
      return ResultAsync.fromPromise(outcome, () =>
        schemaFailure([{ path: [], message: 'Validation rejected' }]),
      ).andThen(toParsedResult);
    }
    return toParsedResult(outcome);
  } catch {
    return errAsync(
      schemaFailure([{ path: [], message: 'Validation threw unexpectedly' }]),
    );
  }
}

function prefixIssues(
  source: 'params' | 'query' | 'body',
  issues: readonly RailIssue[],
): readonly RailIssue[] {
  return issues.map((issue) => ({
    path: [source, ...issue.path],
    message: issue.message,
  }));
}

function parseDeclaredSource(
  source: 'params' | 'query' | 'body',
  schema: StandardSchemaV1,
  value: unknown,
): ResultAsync<unknown, RailError<'validation_error'>> {
  if (value === undefined) {
    return errAsync(
      validationError([
        {
          path: [source],
          message: `Missing required ${source} for this route`,
        },
      ]),
    );
  }

  return parseSchema(schema, value).mapErr((failure) =>
    validationError(prefixIssues(source, failure.issues)),
  );
}

/**
 * Parse each declared input source independently.
 * Client and server both call this — client with InferInput-shaped values,
 * server with wire-decoded params / query / body.
 */
export function parseRouteSources<TRoute extends RouteDef>(
  route: TRoute,
  raw: RawRouteSources,
): ResultAsync<HandlerArgsOf<TRoute>, RailError<'validation_error'>> {
  const checks: ResultAsync<
    Partial<Record<'params' | 'query' | 'body', unknown>>,
    RailError<'validation_error'>
  >[] = [];

  if (route.params !== undefined) {
    checks.push(
      parseDeclaredSource('params', route.params, raw.params).map((value) => ({
        params: value,
      })),
    );
  }

  if (route.query !== undefined) {
    checks.push(
      parseDeclaredSource('query', route.query, raw.query).map((value) => ({
        query: value,
      })),
    );
  }

  if (route.body !== undefined) {
    checks.push(
      parseDeclaredSource('body', route.body, raw.body).map((value) => ({
        body: value,
      })),
    );
  }

  if (checks.length === 0) {
    return okAsync({} as HandlerArgsOf<TRoute>);
  }

  return ResultAsync.combine(checks).map((parts) => {
    const merged: Record<string, unknown> = {};
    for (const part of parts) {
      Object.assign(merged, part);
    }
    return merged as HandlerArgsOf<TRoute>;
  });
}

/** Validate handler output; failures surface as internal with a nested cause. */
export function parseOutput<TRoute extends RouteDef>(
  route: TRoute,
  value: unknown,
): ResultAsync<OutputOf<TRoute>, RailError<'internal'>> {
  return parseSchema(route.output, value).mapErr((failure) =>
    railError('internal', 'An unexpected error occurred', {
      cause: railError(
        'output_validation_failed',
        'Handler output violated the route contract',
        failure.issues.length > 0
          ? { issues: failure.issues }
          : undefined,
      ),
    }),
  ) as ResultAsync<OutputOf<TRoute>, RailError<'internal'>>;
}
