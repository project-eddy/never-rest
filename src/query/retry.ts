import type { RailError } from '../error.js';

/**
 * Retry predicate for cache layers (e.g. TanStack Query `retry`).
 *
 * Retries host and transport failures (`unavailable`, `internal`). Domain errors
 * and `validation_error` are not retried — the caller should branch on `Result`
 * instead of treating them as thrown failures.
 */
export function isRetryable(error: RailError): boolean {
  return error.code === 'unavailable' || error.code === 'internal';
}
