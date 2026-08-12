import { describe, expect, it } from 'vitest';

import { chain, flatten, formatChain, railError } from './error.js';

describe('railError', () => {
  it('creates a minimal error', () => {
    expect(railError('not_found', 'missing')).toEqual({
      code: 'not_found',
      message: 'missing',
    });
  });

  it('accepts optional metadata', () => {
    expect(
      railError('validation_error', 'bad', {
        issues: [{ path: ['email'], message: 'invalid' }],
        origin: 'users',
        retryable: true,
        nextStep: 'Fix the email field',
      }),
    ).toEqual({
      code: 'validation_error',
      message: 'bad',
      issues: [{ path: ['email'], message: 'invalid' }],
      origin: 'users',
      retryable: true,
      nextStep: 'Fix the email field',
    });
  });
});

describe('chain', () => {
  it('attaches a downstream cause', () => {
    const cause = railError('internal', 'db timeout');
    const outer = chain(
      { code: 'internal', message: 'request failed', origin: 'gateway' },
      cause,
    );

    expect(outer.cause).toEqual(cause);
    expect(outer.origin).toBe('gateway');
  });
});

describe('flatten', () => {
  it('returns root-first hops', () => {
    const deep = chain(
      { code: 'internal', message: 'outer' },
      chain({ code: 'internal', message: 'middle' }, railError('internal', 'inner')),
    );

    const hops = flatten(deep);
    expect(hops.map((hop) => hop.message)).toEqual(['outer', 'middle', 'inner']);
  });

  it('returns a single hop when there is no cause', () => {
    const error = railError('not_found', 'missing');
    expect(flatten(error)).toEqual([error]);
  });

  it('stops at cyclic cause chains', () => {
    const inner: { cause?: ReturnType<typeof railError> } = railError(
      'internal',
      'inner',
    );
    const outer = railError('internal', 'outer', {
      cause: inner as ReturnType<typeof railError>,
    });
    inner.cause = outer;

    const hops = flatten(outer);
    expect(hops.length).toBeGreaterThan(0);
    expect(hops.length).toBeLessThanOrEqual(17);
  });
});

describe('formatChain', () => {
  it('formats one line per hop with optional origin', () => {
    const error = chain(
      { code: 'internal', message: 'gateway failed', origin: 'gateway' },
      railError('internal', 'db timeout'),
    );

    expect(formatChain(error)).toBe(
      '[gateway] internal: gateway failed\ninternal: db timeout',
    );
  });
});

describe('JSON round-trip', () => {
  it('preserves a three-deep cause chain', () => {
    const error = chain(
      { code: 'internal', message: 'outer', origin: 'gateway', nextStep: 'Retry later' },
      chain(
        { code: 'internal', message: 'middle', origin: 'users' },
        railError('internal', 'inner db failure', { retryable: true }),
      ),
    );

    const roundTripped = JSON.parse(JSON.stringify(error)) as typeof error;
    expect(roundTripped).toEqual(error);
    expect(roundTripped.cause?.cause?.message).toBe('inner db failure');
  });
});
