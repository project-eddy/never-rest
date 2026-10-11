import { describe, expect, it } from 'vitest';

import { createConcurrencyGate } from './concurrency.js';

describe('createConcurrencyGate', () => {
  it('releases a slot on success and allows the next waiter', async () => {
    const gate = createConcurrencyGate({
      maxInFlight: 1,
      maxQueue: 1,
      queueTimeoutMs: 1_000,
    });
    const first = await gate.acquire(new AbortController().signal);
    expect(first.isOk()).toBe(true);
    first._unsafeUnwrap()();

    const second = await gate.acquire(new AbortController().signal);
    expect(second.isOk()).toBe(true);
    second._unsafeUnwrap()();
    second._unsafeUnwrap()();
  });

  it('rejects when the queue is full', async () => {
    const gate = createConcurrencyGate({
      maxInFlight: 1,
      maxQueue: 0,
      queueTimeoutMs: 1_000,
    });
    await gate.acquire(new AbortController().signal);
    const extra = await gate.acquire(new AbortController().signal);
    expect(extra._unsafeUnwrapErr().code).toBe('boundary.overloaded');
  });

  it('leaves a waiter queued when its cost still does not fit', async () => {
    const gate = createConcurrencyGate({
      maxInFlight: 3,
      maxQueue: 1,
      queueTimeoutMs: 1_000,
    });
    const first = await gate.acquire(new AbortController().signal, 1);
    const second = await gate.acquire(new AbortController().signal, 1);
    const waiting = gate.acquire(new AbortController().signal, 2);
    await Promise.resolve();
    first._unsafeUnwrap()();
    await Promise.resolve();
    second._unsafeUnwrap()();
    const third = await waiting;
    expect(third.isOk()).toBe(true);
    third._unsafeUnwrap()();
  });

  it('admits the next waiter when a slot is released', async () => {
    const gate = createConcurrencyGate({
      maxInFlight: 1,
      maxQueue: 1,
      queueTimeoutMs: 1_000,
    });
    const first = await gate.acquire(new AbortController().signal);
    const waiting = gate.acquire(new AbortController().signal);
    first._unsafeUnwrap()();
    const second = await waiting;
    expect(second.isOk()).toBe(true);
    second._unsafeUnwrap()();
  });

  it('rejects an already-aborted acquire', async () => {
    const gate = createConcurrencyGate({
      maxInFlight: 1,
      maxQueue: 1,
      queueTimeoutMs: 1_000,
    });
    const controller = new AbortController();
    controller.abort();
    const result = await gate.acquire(controller.signal);
    expect(result._unsafeUnwrapErr().code).toBe('boundary.cancelled');
  });

  it('times a queued waiter out as overloaded', async () => {
    const gate = createConcurrencyGate({
      maxInFlight: 1,
      maxQueue: 1,
      queueTimeoutMs: 10,
    });
    await gate.acquire(new AbortController().signal);
    const queued = await gate.acquire(new AbortController().signal);
    expect(queued._unsafeUnwrapErr().code).toBe('boundary.overloaded');
  });

  it('Removing a waiter when the signal aborts', async () => {
    const gate = createConcurrencyGate({
      maxInFlight: 1,
      maxQueue: 1,
      queueTimeoutMs: 5_000,
    });
    await gate.acquire(new AbortController().signal);
    const controller = new AbortController();
    const waiting = gate.acquire(controller.signal);
    controller.abort();
    const result = await waiting;
    expect(result._unsafeUnwrapErr().code).toBe('boundary.cancelled');
  });
});
