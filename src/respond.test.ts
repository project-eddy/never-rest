import { err, ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import { chain, railError } from './error.js';
import { respond } from './respond.js';

const statuses = {
  validation_error: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  internal: 500,
} as const;

type TestCode = keyof typeof statuses;

describe('respond', () => {
  it('maps ok results to the success status', () => {
    const response = respond(ok({ id: '1' }), {
      success: 200,
      statuses,
      declared: [200, 400, 401, 404, 409, 500],
    });

    expect(response).toEqual({ status: 200, body: { id: '1' } });
  });

  it('maps errors through declared statuses', () => {
    const response = respond(err(railError<TestCode>('unauthorized', 'nope')), {
      success: 200,
      statuses,
      declared: [401, 500],
    });

    expect(response).toEqual({
      status: 401,
      body: { code: 'unauthorized', message: 'nope' },
    });
  });

  it('degrades undeclared error statuses to 500', () => {
    const response = respond(err(railError<TestCode>('conflict', 'clash')), {
      success: 200,
      statuses,
      declared: [400, 401],
    });

    expect(response.status).toBe(500);
    expect(response.body.code).toBe('conflict');
  });

  it('defaults disclosure to full', () => {
    const cause = railError('internal', 'HIDDEN_CAUSE_DETAIL');
    const error = chain({ code: 'internal', message: 'failed' }, cause);

    const response = respond(err(error), {
      success: 200,
      statuses,
      declared: [500],
    });

    expect(response.body.cause?.message).toBe('HIDDEN_CAUSE_DETAIL');
  });

  it('applies disclosure before mapping status', () => {
    const cause = railError('internal', 'HIDDEN_CAUSE_DETAIL');
    const error = chain({ code: 'internal', message: 'failed' }, cause);

    const response = respond(err(error), {
      success: 200,
      statuses,
      declared: [500],
      disclosure: 'public',
    });

    expect(response.body.cause).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('HIDDEN_CAUSE_DETAIL');
  });
});
