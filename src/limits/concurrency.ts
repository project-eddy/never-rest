import { errAsync, okAsync, ResultAsync } from 'neverthrow';

import { boundaryError } from '../boundary.js';
import type { ConcurrencyGate, ConcurrencyRelease } from './types.js';

export interface ConcurrencyGateOptions {
  readonly maxInFlight: number;
  readonly maxQueue: number;
  readonly queueTimeoutMs: number;
}

interface Waiter {
  readonly cost: number;
  readonly resolve: (release: ConcurrencyRelease) => void;
  readonly reject: (error: unknown) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly onAbort: () => void;
  readonly signal: AbortSignal;
}

function createRelease(
  state: { inFlight: number; waiters: Waiter[] },
  cost: number,
  admitNext: () => void,
): ConcurrencyRelease {
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    state.inFlight -= cost;
    admitNext();
  };
}

function removeWaiter(waiters: Waiter[], waiter: Waiter): void {
  const index = waiters.indexOf(waiter);
  if (index !== -1) {
    waiters.splice(index, 1);
  }
}

function detachWaiter(waiter: Waiter, waiters: Waiter[]): void {
  clearTimeout(waiter.timer);
  waiter.signal.removeEventListener('abort', waiter.onAbort);
  removeWaiter(waiters, waiter);
}

/**
 * Bounded in-flight + queue gate. Abort removes a waiter. Release is
 * idempotent and always returns the slot.
 */
export function createConcurrencyGate(
  options: ConcurrencyGateOptions,
): ConcurrencyGate {
  const state = { inFlight: 0, waiters: [] as Waiter[] };

  function admitNext(): void {
    const next = state.waiters[0];
    if (next === undefined) {
      return;
    }
    if (state.inFlight + next.cost > options.maxInFlight) {
      return;
    }
    state.waiters.shift();
    clearTimeout(next.timer);
    next.signal.removeEventListener('abort', next.onAbort);
    state.inFlight += next.cost;
    next.resolve(createRelease(state, next.cost, admitNext));
  }

  function enqueue(cost: number, signal: AbortSignal): Promise<ConcurrencyRelease> {
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        cost,
        resolve,
        reject,
        timer: setTimeout(() => {
          detachWaiter(waiter, state.waiters);
          reject(boundaryError('boundary.overloaded'));
        }, options.queueTimeoutMs),
        onAbort: () => {
          detachWaiter(waiter, state.waiters);
          reject(boundaryError('boundary.cancelled'));
        },
        signal,
      };
      signal.addEventListener('abort', waiter.onAbort, { once: true });
      state.waiters.push(waiter);
    });
  }

  return {
    acquire(signal, cost = 1) {
      if (signal.aborted) {
        return errAsync(boundaryError('boundary.cancelled'));
      }
      if (state.inFlight + cost <= options.maxInFlight) {
        state.inFlight += cost;
        return okAsync(createRelease(state, cost, admitNext));
      }
      if (state.waiters.length >= options.maxQueue) {
        return errAsync(boundaryError('boundary.overloaded'));
      }
      return ResultAsync.fromPromise(enqueue(cost, signal), (error) => {
        if (typeof error === 'object' && error !== null && 'code' in error) {
          return error as ReturnType<typeof boundaryError>;
        }
        return boundaryError('boundary.overloaded');
      });
    },
  };
}
