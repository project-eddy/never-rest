import { describe, expect, it } from 'vitest';

import { createMemoryLimiter } from './memory.js';

describe('createMemoryLimiter', () => {
  it('Allowing consumption up to the point budget', async () => {
    const limiter = createMemoryLimiter({
      points: 2,
      durationMs: 60_000,
      maxKeys: 10,
    });

    const first = await limiter.consume('ada', 1);
    const second = await limiter.consume('ada', 1);
    const third = await limiter.consume('ada', 1);

    expect(first._unsafeUnwrap()).toEqual({ kind: 'allowed' });
    expect(second._unsafeUnwrap()).toEqual({ kind: 'allowed' });
    expect(third._unsafeUnwrap().kind).toBe('limited');
  });

  it('prunes expired keys so a later consume is allowed', async () => {
    const limiter = createMemoryLimiter({
      points: 1,
      durationMs: 5,
      maxKeys: 1,
    });
    await limiter.consume('ada', 1);
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    const later = await limiter.consume('ada', 1);
    expect(later._unsafeUnwrap()).toEqual({ kind: 'allowed' });
  });

  it('limits a first consume when the cost exceeds the point budget', async () => {
    const limiter = createMemoryLimiter({
      points: 1,
      durationMs: 60_000,
      maxKeys: 10,
    });
    const result = await limiter.consume('ada', 5);
    expect(result._unsafeUnwrap().kind).toBe('limited');
  });

  it('Limiting new keys once the cardinality cap is reached', async () => {
    const limiter = createMemoryLimiter({
      points: 5,
      durationMs: 60_000,
      maxKeys: 1,
    });

    await limiter.consume('one', 1);
    const extra = await limiter.consume('two', 1);

    expect(extra._unsafeUnwrap().kind).toBe('limited');
  });
});
