const DEFAULT_MAX_RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

function clampRetryAfterMs(value: number, maxMs: number): number | undefined {
  if (!Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.min(value, maxMs);
}

function parseDeltaSeconds(
  value: string,
  maxMs: number,
): number | undefined {
  if (!/^\d+$/.test(value)) {
    return undefined;
  }
  return clampRetryAfterMs(Number(value) * 1000, maxMs);
}

function parseHttpDate(
  value: string,
  nowMs: number,
  maxMs: number,
): number | undefined {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return undefined;
  }
  return clampRetryAfterMs(parsed - nowMs, maxMs);
}

/**
 * Parse a Retry-After header as delta-seconds or HTTP-date.
 * Invalid values are ignored. The result is clamped to maxRetryAfterMs.
 */
export function parseRetryAfterMs(
  value: string | null,
  options: { readonly nowMs?: number; readonly maxRetryAfterMs?: number } = {},
): number | undefined {
  if (value === null || value.trim() === '') {
    return undefined;
  }

  const maxMs = options.maxRetryAfterMs ?? DEFAULT_MAX_RETRY_AFTER_MS;
  const trimmed = value.trim();
  const delta = parseDeltaSeconds(trimmed, maxMs);
  if (delta !== undefined) {
    return delta;
  }
  return parseHttpDate(trimmed, options.nowMs ?? Date.now(), maxMs);
}

/** Whole seconds for an HTTP Retry-After header, rounded up. */
export function retryAfterHeaderSeconds(retryAfterMs: number): string {
  return String(Math.ceil(retryAfterMs / 1000));
}
