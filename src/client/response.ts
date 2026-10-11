import type { StandardSchemaV1 } from '@standard-schema/spec';
import { errAsync, okAsync, ResultAsync } from 'neverthrow';

import {
  BOUNDARY_STATUS_MAP,
  boundaryCodeForStatus,
  boundaryError,
  isBoundaryHttpErrorCode,
} from '../boundary.js';
import type { ClientErrorOf, OutputOf, RouteDef } from '../contract/types.js';
import {
  railError,
  type RailError,
  type RailIssue,
} from '../error.js';
import { parseRetryAfterMs } from '../retry-after.js';
import { HOST_STATUSES } from '../status.js';

export const MAX_CAUSE_DEPTH = 16;

function isPathArray(path: unknown): path is readonly (string | number)[] {
  if (!Array.isArray(path)) {
    return false;
  }
  return path.every(
    (segment) => typeof segment === 'string' || typeof segment === 'number',
  );
}

function isValidIssue(value: unknown): value is RailIssue {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const issue = value as Record<string, unknown>;
  if (typeof issue.message !== 'string') {
    return false;
  }
  if (issue.path === undefined) {
    return true;
  }
  return isPathArray(issue.path);
}

function optionalString(value: unknown): string | undefined | 'invalid' {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === 'string' ? value : 'invalid';
}

function optionalBoolean(value: unknown): boolean | undefined | 'invalid' {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === 'boolean' ? value : 'invalid';
}

function optionalRetryAfterMs(value: unknown): number | undefined | 'invalid' {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 'invalid';
  }
  return value;
}

function parseIssues(value: unknown): readonly RailIssue[] | 'invalid' {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || !value.every(isValidIssue)) {
    return 'invalid';
  }
  return value;
}

function parseCtx(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined | 'invalid' {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'invalid';
  }
  return value as Readonly<Record<string, unknown>>;
}

function parseOptionalFields(candidate: Record<string, unknown>):
  | 'invalid'
  | {
      readonly issues: readonly RailIssue[] | undefined;
      readonly origin: string | undefined;
      readonly nextStep: string | undefined;
      readonly retryable: boolean | undefined;
      readonly retryAfterMs: number | undefined;
      readonly ctx: Readonly<Record<string, unknown>> | undefined;
    } {
  const issues = parseIssues(candidate.issues);
  const origin = optionalString(candidate.origin);
  const nextStep = optionalString(candidate.nextStep);
  const retryable = optionalBoolean(candidate.retryable);
  const retryAfterMs = optionalRetryAfterMs(candidate.retryAfterMs);
  const ctx = parseCtx(candidate.ctx);
  if (
    issues === 'invalid' ||
    origin === 'invalid' ||
    nextStep === 'invalid' ||
    retryable === 'invalid' ||
    retryAfterMs === 'invalid' ||
    ctx === 'invalid'
  ) {
    return 'invalid';
  }
  return {
    issues: candidate.issues === undefined ? undefined : issues,
    origin,
    nextStep,
    retryable,
    retryAfterMs,
    ctx,
  };
}

function assignDefined<T extends object>(
  target: T,
  key: keyof T,
  value: T[keyof T] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function envelopeExtra(
  fields: Exclude<ReturnType<typeof parseOptionalFields>, 'invalid'>,
  cause: RailError<string> | undefined,
): Omit<RailError<string>, 'code' | 'message'> | undefined {
  const extra: Omit<RailError<string>, 'code' | 'message'> = {};
  assignDefined(extra, 'issues', fields.issues);
  assignDefined(extra, 'origin', fields.origin);
  assignDefined(extra, 'nextStep', fields.nextStep);
  assignDefined(extra, 'retryable', fields.retryable);
  assignDefined(extra, 'retryAfterMs', fields.retryAfterMs);
  assignDefined(extra, 'ctx', fields.ctx);
  assignDefined(extra, 'cause', cause);
  return Object.keys(extra).length > 0 ? extra : undefined;
}

function parseCause(
  value: unknown,
  depth: number,
): RailError<string> | undefined | 'missing' {
  if (value === undefined) {
    return 'missing';
  }
  return parseRailErrorEnvelope(value, depth + 1);
}

function asErrorCandidate(
  value: unknown,
): { readonly code: string; readonly message: string } & Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.code !== 'string' || typeof candidate.message !== 'string') {
    return undefined;
  }
  return candidate as { readonly code: string; readonly message: string } & Record<
    string,
    unknown
  >;
}

/** Parse a wire error envelope with bounded cause depth; malformed input returns undefined. */
export function parseRailErrorEnvelope(
  value: unknown,
  depth = 0,
): RailError<string> | undefined {
  if (depth > MAX_CAUSE_DEPTH) {
    return undefined;
  }
  const candidate = asErrorCandidate(value);
  if (candidate === undefined) {
    return undefined;
  }

  const fields = parseOptionalFields(candidate);
  if (fields === 'invalid') {
    return undefined;
  }

  const cause = parseCause(candidate.cause, depth);
  if (cause === undefined) {
    return undefined;
  }

  return railError(
    candidate.code,
    candidate.message,
    envelopeExtra(fields, cause === 'missing' ? undefined : cause),
  );
}

function internalError(message: string): RailError<'internal'> {
  return railError('internal', message);
}

function unavailableError(): RailError<'unavailable'> {
  return railError('unavailable', 'Network request failed', { retryable: true });
}

function isStringOrNumber(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

function primitiveOrString(value: unknown): string | number {
  return isStringOrNumber(value) ? value : String(value);
}

function keyFromPathObject(segment: object): string | number {
  if (!('key' in segment)) {
    return String(segment);
  }
  return primitiveOrString((segment as { key: unknown }).key);
}

function toPathSegment(
  segment: PropertyKey | StandardSchemaV1.PathSegment,
): string | number {
  if (typeof segment === 'object' && segment !== null) {
    return keyFromPathObject(segment);
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
    const suffix = paths.length > 0 ? `: ${paths}` : '';
    return errAsync(internalError(`Response validation failed${suffix}`));
  }
  if ('value' in result) {
    return okAsync(result.value);
  }
  return errAsync(internalError('Response validation failed'));
}

const HOST_CODE_STATUSES: { readonly [code: string]: number } = {
  validation_error: HOST_STATUSES.validation_error,
  internal: HOST_STATUSES.internal,
};

function expectedStatusForCode(route: RouteDef, code: string): number | undefined {
  if (code in route.errors) {
    return route.errors[code];
  }
  if (isBoundaryHttpErrorCode(code)) {
    return BOUNDARY_STATUS_MAP[code];
  }
  return HOST_CODE_STATUSES[code];
}

function envelopeAgrees(
  route: RouteDef,
  error: RailError<string>,
  status: number,
): boolean {
  const expected = expectedStatusForCode(route, error.code);
  return expected === status;
}

function withRetryAfter<TCode extends string>(
  error: RailError<TCode>,
  retryAfterMs: number | undefined,
): RailError<TCode> {
  if (retryAfterMs === undefined || error.retryAfterMs !== undefined) {
    return error;
  }
  return { ...error, retryAfterMs };
}

function mapProtocolError<TRoute extends RouteDef>(
  route: TRoute,
  error: RailError<string>,
  status: number,
): ClientErrorOf<TRoute> {
  if (envelopeAgrees(route, error, status)) {
    return error as ClientErrorOf<TRoute>;
  }

  return railError('internal', 'Unexpected error response', {
    cause: error,
  }) as ClientErrorOf<TRoute>;
}

function mapStatusWithoutEnvelope<TRoute extends RouteDef>(
  status: number,
  retryAfterMs: number | undefined,
): ClientErrorOf<TRoute> {
  const boundaryCode = boundaryCodeForStatus(status);
  if (boundaryCode !== undefined) {
    return boundaryError(boundaryCode, {
      retryAfterMs,
      ctx: { httpStatus: status },
    }) as ClientErrorOf<TRoute>;
  }
  if (status === 502) {
    return unavailableError() as ClientErrorOf<TRoute>;
  }
  return railError('internal', 'Unexpected error response', {
    ctx: { httpStatus: status },
  }) as ClientErrorOf<TRoute>;
}

function mapErrorBody<TRoute extends RouteDef>(
  route: TRoute,
  response: Response,
  text: string,
): ClientErrorOf<TRoute> {
  const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
  let parsed: unknown;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    return mapStatusWithoutEnvelope(response.status, retryAfterMs);
  }

  const envelope = parseRailErrorEnvelope(parsed);
  if (envelope === undefined) {
    return mapStatusWithoutEnvelope(response.status, retryAfterMs);
  }

  return withRetryAfter(
    mapProtocolError(route, envelope, response.status),
    retryAfterMs,
  );
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
    (text) => errAsync(mapErrorBody(route, response, text)),
  );
}
