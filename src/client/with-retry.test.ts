import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { railError } from '../error.js';
import { withRetry } from './with-retry.js';

describe('withRetry', () => {
  it('Refusing to replay a non-idempotent call', async () => {
    const call = vi.fn(() =>
      errAsync(railError('unavailable', 'down', { retryable: true })),
    );

    const result = await withRetry(call, { idempotent: false, attempts: 3 });

    expect(call).toHaveBeenCalledTimes(1);
    expect(result.isErr()).toBe(true);
  });

  it('Retrying a retryable error when idempotent is true', async () => {
    const call = vi
      .fn()
      .mockReturnValueOnce(errAsync(railError('unavailable', 'down')))
      .mockReturnValueOnce(okAsync({ ok: true }));

    const result = await withRetry(call, {
      idempotent: true,
      attempts: 3,
      baseMs: 1,
      capMs: 2,
    });

    expect(call).toHaveBeenCalledTimes(2);
    expect(result._unsafeUnwrap()).toEqual({ ok: true });
  });

  it('returns cancelled when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const call = vi.fn(() => okAsync({ ok: true }));
    const result = await withRetry(call, {
      idempotent: true,
      signal: controller.signal,
    });
    expect(call).not.toHaveBeenCalled();
    expect(result._unsafeUnwrapErr().code).toBe('boundary.cancelled');
  });

  it('clamps attempts below 1 to a single try', async () => {
    const call = vi.fn(() =>
      errAsync(railError('unavailable', 'down', { retryable: true })),
    );
    const result = await withRetry(call, { idempotent: true, attempts: 0 });
    expect(call).toHaveBeenCalledTimes(1);
    expect(result.isErr()).toBe(true);
  });

  it('honours retryAfterMs up to the cap', async () => {
    const call = vi
      .fn()
      .mockReturnValueOnce(
        errAsync(
          railError('boundary.rate_limited', 'slow', {
            retryable: true,
            retryAfterMs: 1,
          }),
        ),
      )
      .mockReturnValueOnce(okAsync({ ok: true }));
    const result = await withRetry(call, {
      idempotent: true,
      attempts: 3,
      baseMs: 1,
      capMs: 5,
    });
    expect(result._unsafeUnwrap()).toEqual({ ok: true });
  });

  it('Stopping retrying when the signal aborts', async () => {
    const controller = new AbortController();
    const call = vi.fn(() => {
      controller.abort();
      return errAsync(railError('unavailable', 'down'));
    });

    const result = await withRetry(call, {
      idempotent: true,
      attempts: 5,
      signal: controller.signal,
      baseMs: 1,
    });

    expect(result._unsafeUnwrapErr().code).toBe('boundary.cancelled');
  });
});
