import { describe, expect, it } from 'vitest';

import { railError } from './error.js';
import { HOST_STATUSES, statusFor, toDeclaredResponse } from './status.js';

const statuses = {
  validation_error: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  internal: 500,
} as const;

type TestCode = keyof typeof statuses;

describe('HOST_STATUSES', () => {
  it('exposes default host status codes', () => {
    expect(HOST_STATUSES).toEqual({
      validation_error: 400,
      internal: 500,
      route_not_found: 404,
    });
  });
});

describe('statusFor', () => {
  it('maps error codes through the supplied status map', () => {
    expect(statusFor(statuses, railError<TestCode>('validation_error', 'bad'))).toBe(400);
    expect(statusFor(statuses, railError<TestCode>('unauthorized', 'nope'))).toBe(401);
    expect(statusFor(statuses, railError<TestCode>('conflict', 'clash'))).toBe(409);
    expect(statusFor(statuses, railError<TestCode>('internal', 'boom'))).toBe(500);
  });
});

describe('toDeclaredResponse', () => {
  it('degrades undeclared statuses to 500', () => {
    const response = toDeclaredResponse(
      railError<TestCode>('conflict', 'clash'),
      statuses,
      [400, 401],
    );

    expect(response.status).toBe(500);
    expect(response.body.code).toBe('conflict');
  });

  it('keeps declared statuses', () => {
    const response = toDeclaredResponse(
      railError<TestCode>('unauthorized', 'nope'),
      statuses,
      [401, 500],
    );

    expect(response.status).toBe(401);
  });
});
