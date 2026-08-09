import { describe, expect, it } from 'vitest';

import { disclose } from './disclose.js';
import { chain, railError } from './error.js';

describe('disclose', () => {
  const internalCause = railError('internal', 'SECRET_INTERNAL_DB_CONNECTION_FAILED');
  const error = chain(
    {
      code: 'internal',
      message: 'Request failed',
      origin: 'gateway',
      nextStep: 'SECRET_INTERNAL_DB_CONNECTION_FAILED — check logs',
      issues: [{ path: ['password_hash'], message: 'invalid' }],
      retryable: true,
    },
    internalCause,
  );

  it('returns the full error unchanged', () => {
    expect(disclose(error, 'full')).toEqual(error);
  });

  it('drops cause and origin on internal disclosure', () => {
    const disclosed = disclose(error, 'internal');

    expect(disclosed).toEqual({
      code: 'internal',
      message: 'Request failed',
      issues: [{ path: ['password_hash'], message: 'invalid' }],
      nextStep: 'SECRET_INTERNAL_DB_CONNECTION_FAILED — check logs',
      retryable: true,
    });
    expect(disclosed.cause).toBeUndefined();
    expect(disclosed.origin).toBeUndefined();
  });

  it('does not leak nested cause messages on public disclosure', () => {
    const disclosed = disclose(error, 'public');
    const serialized = JSON.stringify(disclosed);

    expect(serialized).not.toContain('SECRET_INTERNAL_DB_CONNECTION_FAILED');
    expect(disclosed.cause).toBeUndefined();
    expect(disclosed.origin).toBeUndefined();
    expect(disclosed.issues).toEqual([{ path: [], message: 'invalid' }]);
    expect(disclosed.nextStep).toBeUndefined();
  });

  it('keeps advisory nextStep on public disclosure', () => {
    const advisory = chain(
      {
        code: 'conflict',
        message: 'Activation already in progress',
        nextStep: 'Wait a few minutes and try again',
      },
      railError('internal', 'HIDDEN_DOWNSTREAM_DETAIL'),
    );

    const disclosed = disclose(advisory, 'public');

    expect(disclosed.nextStep).toBe('Wait a few minutes and try again');
    expect(JSON.stringify(disclosed)).not.toContain('HIDDEN_DOWNSTREAM_DETAIL');
  });
});
