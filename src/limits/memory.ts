import { okAsync } from 'neverthrow';

import type { ConsumeResult, Limiter } from './types.js';

export interface MemoryLimiterOptions {
  readonly points: number;
  readonly durationMs: number;
  readonly maxKeys: number;
}

interface Bucket {
  remaining: number;
  resetAt: number;
}

function pruneExpired(buckets: Map<string, Bucket>, now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function limited(retryAfterMs: number): ConsumeResult {
  return { kind: 'limited', retryAfterMs: Math.max(0, retryAfterMs) };
}

function consumeExisting(
  bucket: Bucket,
  cost: number,
  now: number,
): ConsumeResult {
  if (bucket.remaining < cost) {
    return limited(bucket.resetAt - now);
  }
  bucket.remaining -= cost;
  return { kind: 'allowed' };
}

function consumeNew(
  buckets: Map<string, Bucket>,
  key: string,
  cost: number,
  options: MemoryLimiterOptions,
  now: number,
): ConsumeResult {
  if (buckets.size >= options.maxKeys) {
    return limited(options.durationMs);
  }
  if (options.points < cost) {
    buckets.set(key, { remaining: options.points, resetAt: now + options.durationMs });
    return limited(options.durationMs);
  }
  buckets.set(key, {
    remaining: options.points - cost,
    resetAt: now + options.durationMs,
  });
  return { kind: 'allowed' };
}

/**
 * Single-process limiter. State resets on restart and is not shared between
 * replicas. Keys expire after durationMs; new keys are limited once maxKeys
 * is reached.
 */
export function createMemoryLimiter(options: MemoryLimiterOptions): Limiter {
  const buckets = new Map<string, Bucket>();

  return {
    consume(key, cost) {
      const now = Date.now();
      pruneExpired(buckets, now);
      const existing = buckets.get(key);
      const result =
        existing === undefined
          ? consumeNew(buckets, key, cost, options, now)
          : consumeExisting(existing, cost, now);
      return okAsync(result);
    },
  };
}
