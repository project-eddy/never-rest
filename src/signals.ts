import { boundaryError } from './boundary.js';
import type { RailError } from './error.js';

/** Combine optional abort signals; empty input yields a never-aborted signal. */
export function combineAbortSignals(
  signals: readonly (AbortSignal | undefined)[],
): AbortSignal {
  const active = signals.filter((signal): signal is AbortSignal => signal !== undefined);
  if (active.length === 0) {
    return new AbortController().signal;
  }
  if (active.length === 1) {
    return active[0];
  }
  return AbortSignal.any(active);
}

/** True when the abort reason is a timeout (AbortSignal.timeout). */
export function isTimeoutAbort(signal: AbortSignal): boolean {
  const reason = signal.reason;
  return reason instanceof DOMException && reason.name === 'TimeoutError';
}

/** Map an aborted signal to a host timeout or cancellation error. */
export function errorForAbort(
  signal: AbortSignal,
): RailError<'boundary.timeout' | 'boundary.cancelled'> {
  if (isTimeoutAbort(signal)) {
    return boundaryError('boundary.timeout');
  }
  return boundaryError('boundary.cancelled');
}

/** True when a fetch/promise rejection is an abort. */
export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  return error instanceof Error && error.name === 'AbortError';
}
