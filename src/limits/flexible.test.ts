import { RateLimiterMemory } from 'rate-limiter-flexible';
import { describe, expect, it } from 'vitest';

import {
  allowedResult,
  fromRateLimiterFlexible,
  limiterUnavailable,
} from './flexible.js';

describe('fromRateLimiterFlexible', () => {
  it('maps a rejection with msBeforeNext to a limited result', async () => {
    const limiter = fromRateLimiterFlexible({
      consume: async () => {
        throw { msBeforeNext: 1500 };
      },
    });

    const result = await limiter.consume('ada', 1);

    expect(result._unsafeUnwrap()).toEqual({
      kind: 'limited',
      retryAfterMs: 1500,
    });
  });

  it('treats a rejection without numeric msBeforeNext as a store failure', async () => {
    const limiter = fromRateLimiterFlexible({
      consume: async () => {
        throw 'down';
      },
    });
    const result = await limiter.consume('ada', 1);
    expect(result._unsafeUnwrapErr().code).toBe('limiter_unavailable');
  });

  it('Mapping an Error rejection to limiter_unavailable', async () => {
    const limiter = fromRateLimiterFlexible({
      consume: async () => {
        throw new Error('redis down');
      },
    });

    const result = await limiter.consume('ada', 1);

    expect(result._unsafeUnwrapErr().code).toBe('limiter_unavailable');
  });

  it('adapts RateLimiterMemory from rate-limiter-flexible', async () => {
    const memory = new RateLimiterMemory({ points: 1, duration: 60 });
    const limiter = fromRateLimiterFlexible(memory);

    const first = await limiter.consume('ada', 1);
    const second = await limiter.consume('ada', 1);

    expect(first._unsafeUnwrap()).toEqual({ kind: 'allowed' });
    expect(second._unsafeUnwrap().kind).toBe('limited');
  });

  it('exposes allowed and unavailable helpers', async () => {
    expect((await allowedResult())._unsafeUnwrap()).toEqual({ kind: 'allowed' });
    expect((await limiterUnavailable())._unsafeUnwrapErr().code).toBe(
      'limiter_unavailable',
    );
  });

  it('maps a resolved consume to allowed', async () => {
    const limiter = fromRateLimiterFlexible({
      consume: async () => ({ remainingPoints: 3 }),
    });

    const result = await limiter.consume('ada', 1);

    expect(result._unsafeUnwrap()).toEqual({ kind: 'allowed' });
  });
});
