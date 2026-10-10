import { describe, expect, it } from 'vitest';

import { parseRetryAfterMs, retryAfterHeaderSeconds } from './retry-after.js';

describe('parseRetryAfterMs', () => {
  it('parses delta-seconds and HTTP-date Retry-After values', () => {
    expect(parseRetryAfterMs('2')).toBe(2000);
    const now = Date.parse('Wed, 21 Oct 2015 07:28:00 GMT');
    expect(
      parseRetryAfterMs('Wed, 21 Oct 2015 07:28:05 GMT', { nowMs: now }),
    ).toBe(5000);
  });

  it('ignores invalid Retry-After values and clamps the hint', () => {
    expect(parseRetryAfterMs('nope')).toBeUndefined();
    expect(parseRetryAfterMs(null)).toBeUndefined();
    expect(parseRetryAfterMs('999999', { maxRetryAfterMs: 1000 })).toBe(1000);
  });

  it('rounds retryAfterMs up to whole seconds for the header', () => {
    expect(retryAfterHeaderSeconds(1)).toBe('1');
    expect(retryAfterHeaderSeconds(1001)).toBe('2');
  });
});
