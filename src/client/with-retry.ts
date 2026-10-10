import { errAsync, ResultAsync } from 'neverthrow';

import type { RailError } from '../error.js';
import { isRetryable } from '../query/retry.js';
import { errorForAbort } from '../signals.js';

export interface RetryOptions {
  readonly idempotent: boolean;
  readonly attempts?: number;
  readonly baseMs?: number;
  readonly capMs?: number;
  readonly signal?: AbortSignal;
}

const DEFAULT_ATTEMPTS = 3;
const MAX_ATTEMPTS = 10;
const DEFAULT_BASE_MS = 100;
const DEFAULT_CAP_MS = 30_000;

function resolveAttempts(attempts: number | undefined): number {
  const value = attempts ?? DEFAULT_ATTEMPTS;
  if (value < 1) {
    return 1;
  }
  return Math.min(value, MAX_ATTEMPTS);
}

function backoffMs(
  attempt: number,
  baseMs: number,
  capMs: number,
  retryAfterMs: number | undefined,
): number {
  const exponential = Math.min(capMs, baseMs * 2 ** attempt);
  const jittered = Math.random() * exponential;
  if (retryAfterMs === undefined) {
    return jittered;
  }
  return Math.min(capMs, Math.max(jittered, retryAfterMs));
}

function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(errorForAbort(signal));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(errorForAbort(signal as AbortSignal));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function shouldRetry<E extends RailError>(
  error: E,
  remaining: number,
  idempotent: boolean,
  signal: AbortSignal | undefined,
): boolean {
  if (!idempotent || remaining <= 0) {
    return false;
  }
  if (signal?.aborted) {
    return false;
  }
  return isRetryable(error);
}

/**
 * Retry a ResultAsync call. `idempotent` is required: writes are not
 * replayed unless the caller says replay is safe. Backoff is exponential
 * with full jitter and honours `retryAfterMs` up to `capMs`.
 */
export function withRetry<T, E extends RailError>(
  call: () => ResultAsync<T, E>,
  options: RetryOptions,
): ResultAsync<T, E> {
  const attempts = resolveAttempts(options.attempts);
  const baseMs = options.baseMs ?? DEFAULT_BASE_MS;
  const capMs = options.capMs ?? DEFAULT_CAP_MS;
  const signal = options.signal;

  function next(remaining: number, attempt: number): ResultAsync<T, E> {
    if (signal?.aborted) {
      return errAsync(errorForAbort(signal) as E);
    }
    return call().orElse((error) => {
      if (signal?.aborted) {
        return errAsync(errorForAbort(signal) as E);
      }
      if (!shouldRetry(error, remaining - 1, options.idempotent, signal)) {
        return errAsync(error);
      }
      return ResultAsync.fromPromise(
        wait(backoffMs(attempt, baseMs, capMs, error.retryAfterMs), signal),
        (aborted) => aborted as E,
      ).andThen(() => next(remaining - 1, attempt + 1));
    });
  }

  return next(attempts, 0);
}
