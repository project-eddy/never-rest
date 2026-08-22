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

  describe('ctx', () => {
    const withCtx = railError('rejected', 'Submission rejected', {
      ctx: {
        gate: 'verify',
        category: 'evidence_missing',
        SECRET_SHARD_KEY: 'shard-7',
      },
    });

    it('keeps ctx on full disclosure', () => {
      expect(disclose(withCtx, 'full').ctx).toEqual({
        gate: 'verify',
        category: 'evidence_missing',
        SECRET_SHARD_KEY: 'shard-7',
      });
    });

    it('keeps ctx on internal disclosure', () => {
      expect(disclose(withCtx, 'internal').ctx).toEqual({
        gate: 'verify',
        category: 'evidence_missing',
        SECRET_SHARD_KEY: 'shard-7',
      });
    });

    it('drops ctx on public disclosure', () => {
      const disclosed = disclose(withCtx, 'public');

      expect(disclosed.ctx).toBeUndefined();
      expect(JSON.stringify(disclosed)).not.toContain('SECRET_SHARD_KEY');
      expect(JSON.stringify(disclosed)).not.toContain('shard-7');
    });

    it('omits the ctx key entirely when absent', () => {
      const plain = railError('not_found', 'Missing');

      expect('ctx' in disclose(plain, 'internal')).toBe(false);
      expect('ctx' in disclose(plain, 'public')).toBe(false);
    });
  });

  it('does not loop on cyclic cause chains when checking leakage', () => {
    const inner: { cause?: ReturnType<typeof railError> } = railError(
      'internal',
      'SECRET_CYCLE_DETAIL',
    );
    const outer = chain(
      {
        code: 'internal',
        message: 'Request failed',
        nextStep: 'SECRET_CYCLE_DETAIL — check logs',
      },
      inner as ReturnType<typeof railError>,
    );
    inner.cause = outer;

    const disclosed = disclose(outer, 'public');
    expect(JSON.stringify(disclosed)).not.toContain('SECRET_CYCLE_DETAIL');
    expect(disclosed.cause).toBeUndefined();
  });
});
