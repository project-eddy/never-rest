import { errAsync, okAsync, ResultAsync } from 'neverthrow';

import { railError } from '../error.js';
import type { ConsumeResult, Limiter } from './types.js';

export interface RateLimiterFlexibleLike {
  consume(
    key: string,
    points?: number,
  ): Promise<unknown>;
}

function hasMsBeforeNext(
  value: unknown,
): value is { readonly msBeforeNext: number } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return typeof (value as { msBeforeNext?: unknown }).msBeforeNext === 'number';
}

function mapFlexibleRejection(rejected: unknown): ConsumeResult | 'unavailable' {
  if (hasMsBeforeNext(rejected)) {
    return { kind: 'limited', retryAfterMs: Math.max(0, rejected.msBeforeNext) };
  }
  return 'unavailable';
}

/**
 * Structural adapter for rate-limiter-flexible. A rejection with
 * `msBeforeNext` is a limit; an `Error` (or anything else) is a store failure.
 */
export function fromRateLimiterFlexible(
  limiter: RateLimiterFlexibleLike,
): Limiter {
  return {
    consume(key, cost) {
      return ResultAsync.fromPromise(
        limiter.consume(key, cost).then(
          (): ConsumeResult => ({ kind: 'allowed' }),
          (rejected: unknown): ConsumeResult => {
            const mapped = mapFlexibleRejection(rejected);
            if (mapped === 'unavailable') {
              throw rejected;
            }
            return mapped;
          },
        ),
        () => railError('limiter_unavailable', 'Limiter store failed'),
      );
    },
  };
}

export function limiterUnavailable() {
  return errAsync(railError('limiter_unavailable', 'Limiter store failed'));
}

export function allowedResult() {
  return okAsync({ kind: 'allowed' as const });
}
