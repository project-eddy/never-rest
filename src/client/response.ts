import type { StandardSchemaV1 } from '@standard-schema/spec';
import { errAsync, okAsync, ResultAsync } from 'neverthrow';

import type { RouteDef } from '../contract/types.js';
import { railError, type RailError } from '../error.js';

function isRailError(value: unknown): value is RailError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as RailError;
  return (
    typeof candidate.code === 'string' && typeof candidate.message === 'string'
  );
}

function internalError(message: string): RailError<'internal'> {
  return railError('internal', message);
}

function unavailableError(): RailError<'unavailable'> {
  return railError('unavailable', 'Network request failed', { retryable: true });
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

function validateValue<Output>(
  schema: StandardSchemaV1<unknown, Output>,
  value: unknown,
): ResultAsync<Output, RailError<'internal'>> {
  try {
    const outcome = schema['~standard'].validate(value);
    if (outcome instanceof Promise) {
      return ResultAsync.fromPromise(outcome, () =>
        internalError('Response validation failed'),
      ).andThen((result) => mapValidationResult(result));
    }
    return mapValidationResult(outcome);
  } catch {
    return errAsync(internalError('Response validation failed'));
  }
}

function mapValidationResult<Output>(
  result: StandardSchemaV1.Result<Output>,
): ResultAsync<Output, RailError<'internal'>> {
  if (result.issues !== undefined && result.issues.length > 0) {
    const paths = result.issues
      .map((issue) => issue.path?.map(toPathSegment).join('.') ?? '')
      .join(', ');
    return errAsync(
      internalError(
        paths.length > 0
          ? `Response validation failed: ${paths}`
          : 'Response validation failed',
      ),
    );
  }
  if ('value' in result) {
    return okAsync(result.value);
  }
  return errAsync(internalError('Response validation failed'));
}

function mapDeclaredError<TRoute extends RouteDef>(
  route: TRoute,
  error: RailError,
): RailError<TRoute['errors'][number]> | RailError<'internal'> {
  if ((route.errors as readonly string[]).includes(error.code)) {
    return error as RailError<TRoute['errors'][number]>;
  }
  return internalError(error.message);
}

/** Map an HTTP response to Ok output or Err RailError. */
export function mapResponse<TRoute extends RouteDef>(
  route: TRoute,
  response: Response,
): ResultAsync<
  StandardSchemaV1.InferOutput<TRoute['output']>,
  RailError<TRoute['errors'][number]> | RailError<'internal' | 'unavailable'>
> {
  return ResultAsync.fromPromise(response.text(), () => unavailableError()).andThen(
    (text) => {
      let parsed: unknown;
      try {
        parsed = text.length > 0 ? JSON.parse(text) : undefined;
      } catch {
        return errAsync(internalError('Response body is not valid JSON'));
      }

      const isSuccess = response.status >= 200 && response.status < 300;

      if (isSuccess) {
        return validateValue(route.output, parsed) as ResultAsync<
          StandardSchemaV1.InferOutput<TRoute['output']>,
          RailError<TRoute['errors'][number]> | RailError<'internal' | 'unavailable'>
        >;
      }

      if (isRailError(parsed)) {
        return errAsync(mapDeclaredError(route, parsed));
      }

      return errAsync(internalError('Unexpected error response'));
    },
  );
}
