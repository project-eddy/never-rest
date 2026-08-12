/**
 * Scenario: ClientErrorOf on transport failure.
 * createClient maps a rejecting fetch to code `unavailable` (retryable).
 */
import { describe, expect, it } from 'vitest';

import { createClient } from '../client/create.js';

import { protocolContract } from './fixture.js';

describe('protocol: client unavailable', () => {
  it('rejecting fetch → Err(unavailable)', async () => {
    const client = createClient(protocolContract, {
      baseUrl: 'http://unreachable.local',
      fetch: () => Promise.reject(new TypeError('Failed to fetch')),
    });

    const result = await client.getItem({ id: 'i1' });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.retryable).toBe(true);
    }
  });
});
