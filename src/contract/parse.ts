import type { StandardSchemaV1 } from '@standard-schema/spec';
import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import { railError, type RailError, type RailIssue } from '../error.js';
import type { InputOf, RouteDef } from './types.js';

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

function validationError(issues: readonly RailIssue[]): RailError<'validation_error'> {
  return railError('validation_error', 'Validation failed', { issues });
}

function toResultAsync<Output>(
  result: StandardSchemaV1.Result<Output>,
): ResultAsync<Output, RailError<'validation_error'>> {
  if (result.issues !== undefined && result.issues.length > 0) {
    return errAsync(validationError(result.issues.map(mapIssue)));
  }
  if ('value' in result) {
    return okAsync(result.value);
  }
  return errAsync(validationError([{ path: [], message: 'Validation failed' }]));
}

function validateInput<Output>(
  schema: StandardSchemaV1<unknown, Output>,
  value: unknown,
): ResultAsync<Output, RailError<'validation_error'>> {
  try {
    const outcome = schema['~standard'].validate(value);
    if (outcome instanceof Promise) {
      return ResultAsync.fromPromise(outcome, () =>
        validationError([{ path: [], message: 'Validation rejected' }]),
      ).andThen(toResultAsync);
    }
    return toResultAsync(outcome);
  } catch {
    return errAsync(
      validationError([{ path: [], message: 'Validation threw unexpectedly' }]),
    );
  }
}

/** Validate route input through any Standard Schema validator. */
export function parseInput<TRoute extends RouteDef>(
  route: TRoute,
  value: unknown,
): ResultAsync<InputOf<TRoute>, RailError<'validation_error'>> {
  const schema = route.input;
  if (schema === undefined) {
    return okAsync(undefined as InputOf<TRoute>);
  }
  return validateInput(schema, value) as ResultAsync<
    InputOf<TRoute>,
    RailError<'validation_error'>
  >;
}
