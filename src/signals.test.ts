import { describe, expect, it } from 'vitest';

import {
  combineAbortSignals,
  errorForAbort,
  isAbortError,
  isTimeoutAbort,
} from './signals.js';

describe('combineAbortSignals', () => {
  it('returns a live signal when none are supplied', () => {
    const signal = combineAbortSignals([]);
    expect(signal.aborted).toBe(false);
  });

  it('returns the only supplied signal', () => {
    const controller = new AbortController();
    expect(combineAbortSignals([undefined, controller.signal])).toBe(
      controller.signal,
    );
  });

  it('aborts when any combined signal aborts', () => {
    const first = new AbortController();
    const second = new AbortController();
    const combined = combineAbortSignals([first.signal, second.signal]);
    second.abort();
    expect(combined.aborted).toBe(true);
  });
});

describe('errorForAbort', () => {
  it('maps a timeout abort to boundary.timeout', () => {
    const signal = AbortSignal.timeout(0);
    return new Promise<void>((resolve) => {
      const finish = () => {
        expect(isTimeoutAbort(signal)).toBe(true);
        expect(errorForAbort(signal).code).toBe('boundary.timeout');
        resolve();
      };
      if (signal.aborted) {
        finish();
        return;
      }
      signal.addEventListener('abort', finish, { once: true });
    });
  });

  it('maps a caller abort to boundary.cancelled', () => {
    const controller = new AbortController();
    controller.abort();
    expect(errorForAbort(controller.signal).code).toBe('boundary.cancelled');
  });
});

describe('isAbortError', () => {
  it('recognises DOMException and Error abort names', () => {
    expect(isAbortError(new DOMException('stopped', 'AbortError'))).toBe(true);
    expect(isAbortError(new Error('AbortError'))).toBe(false);
    const named = new Error('stopped');
    named.name = 'AbortError';
    expect(isAbortError(named)).toBe(true);
    expect(isAbortError('nope')).toBe(false);
  });
});
