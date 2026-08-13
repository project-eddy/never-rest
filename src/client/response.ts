import type { StandardSchemaV1 } from '@standard-schema/spec';
import { errAsync, okAsync, ResultAsync } from 'neverthrow';

import type { ClientErrorOf, OutputOf, RouteDef } from '../contract/types.js';
import {
  railError,
  type RailError,
  type RailIssue,
} from '../error.js';

export const MAX_CAUSE_DEPTH = 16;

function isValidIssue(value: unknown): value is RailIssue {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const issue = value as Record<string, unknown>;
  if (typeof issue.message !== 'string') {
    return false;
  }
  if (issue.path !== undefined) {
    if (!Array.isArray(issue.path)) {
      return false;
    }
    for (const segment of issue.path) {
      if (typeof segment !== 'string' && typeof segment !== 'number') {
        return false;
      }
    }
  }
  return true;
}

/** Parse a wire error envelope with bounded cause depth; malformed input returns undefined. */
export function parseRailErrorEnvelope(
  value: unknown,
  depth = 0,
): RailError<string> | undefined {
  if (depth > MAX_CAUSE_DEPTH) {
    return undefined;
  }

  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;

  if (typeof candidate.code !== 'string' || typeof candidate.message !== 'string') {
    return undefined;
  }

  if (candidate.issues !== undefined) {
    if (!Array.isArray(candidate.issues)) {
      return undefined;
    }
    for (const issue of candidate.issues) {
      if (!isValidIssue(issue)) {
        return undefined;
      }
    }
  }

  if (candidate.origin !== undefined && typeof candidate.origin !== 'string') {
    return undefined;
  }

  if (candidate.nextStep !== undefined && typeof candidate.nextStep !== 'string') {
    return undefined;
  }

  if (candidate.retryable !== undefined && typeof candidate.retryable !== 'boolean') {
    return undefined;
  }

  let cause: RailError<string> | undefined;
  if (candidate.cause !== undefined) {
    cause = parseRailErrorEnvelope(candidate.cause, depth + 1);
    if (cause === undefined) {
      return undefined;
    }
  }

  const extra = {
    ...(candidate.issues !== undefined
      ? { issues: candidate.issues as readonly RailIssue[] }
      : {}),
    ...(candidate.origin !== undefined ? { origin: candidate.origin } : {}),
    ...(candidate.nextStep !== undefined ? { nextStep: candidate.nextStep } : {}),
    ...(candidate.retryable !== undefined ? { retryable: candidate.retryable } : {}),
    ...(cause !== undefined ? { cause } : {}),
  };

  return railError(
    candidate.code,
    candidate.message,
    Object.keys(extra).length > 0
      ? (extra as Omit<RailError<string>, 'code' | 'message'>)
      : undefined,
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

function mapProtocolError<TRoute extends RouteDef>(
  route: TRoute,
  error: RailError<string>,
): ClientErrorOf<TRoute> {
  if (error.code in route.errors) {
    return error as ClientErrorOf<TRoute>;
  }

  if (error.code === 'validation_error' || error.code === 'internal') {
    return error as ClientErrorOf<TRoute>;
  }

  return railError('internal', 'Unexpected error response', {
    cause: error,
  }) as ClientErrorOf<TRoute>;
}

function validationError(message: string): RailError<'validation_error'> {
  return railError('validation_error', message);
}

function unexpectedSuccessStatusError(
  actual: number,
  expected: number,
): RailError<'validation_error'> {
  return validationError(
    `Unexpected success status ${actual}; expected ${expected}`,
  );
}

/** Map an HTTP response to Ok output or Err RailError. */
export function mapResponse<TRoute extends RouteDef>(
  route: TRoute,
  response: Response,
): ResultAsync<OutputOf<TRoute>, ClientErrorOf<TRoute>> {
  const expectedStatus = route.success ?? 200;

  if (response.status === expectedStatus) {
    if (expectedStatus === 204 || route.output === undefined) {
      return okAsync(undefined as OutputOf<TRoute>);
    }

    const outputSchema = route.output;
    return ResultAsync.fromPromise(response.text(), () =>
      unavailableError(),
    ).andThen((text) => {
      let parsed: unknown;
      try {
        parsed = text.length > 0 ? JSON.parse(text) : undefined;
      } catch {
        return errAsync(internalError('Response body is not valid JSON'));
      }

      return validateValue(outputSchema, parsed) as ResultAsync<
        OutputOf<TRoute>,
        ClientErrorOf<TRoute>
      >;
    });
  }

  if (response.status >= 200 && response.status < 300) {
    return errAsync(
      unexpectedSuccessStatusError(
        response.status,
        expectedStatus,
      ) as ClientErrorOf<TRoute>,
    );
  }

  return ResultAsync.fromPromise(response.text(), () => unavailableError()).andThen(
    (text) => {
      let parsed: unknown;
      try {
        parsed = text.length > 0 ? JSON.parse(text) : undefined;
      } catch {
        return errAsync(internalError('Response body is not valid JSON'));
      }

      const envelope = parseRailErrorEnvelope(parsed);
      if (envelope !== undefined) {
        return errAsync(mapProtocolError(route, envelope));
      }

      return errAsync(internalError('Unexpected error response'));
    },
  );
}
