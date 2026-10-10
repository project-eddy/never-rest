import type { RailError } from '../error.js';

const RETRYABLE_CODES = new Set([
  'unavailable',
  'boundary.rate_limited',
  'boundary.overloaded',
]);

/**
 * Retry predicate for cache layers and `withRetry`.
 *
 * Retries transport `unavailable`, boundary rate/overload errors, and any
 * error that sets `retryable: true`. Does not retry `internal`,
 * authentication failures, validation errors, or cancellations.
 */
export function isRetryable(error: RailError): boolean {
  if (error.retryable === true) {
    return true;
  }
  return RETRYABLE_CODES.has(error.code);
}
