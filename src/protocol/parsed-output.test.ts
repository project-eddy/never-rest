/**
 * Scenario: always-on parsed output.
 * Handler Ok includes `secret`; wire JSON must match itemSchema only.
 */
import { ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import { serve, type Handlers } from '../server/serve.js';

import {
  isRecord,
  protocolContract,
} from './fixture.js';

describe('protocol: parsed output', () => {
  it('strips unknown fields before serialising', async () => {
    const handlers: Handlers<typeof protocolContract, undefined> = {
      getItem: () =>
        ok({
          id: 'i1',
          name: 'Widget',
          secret: 'must-not-leak',
        }),
    };
    const api = serve(protocolContract, handlers, {
      origin: 'protocol-smoke',
    });

    const response = await api(
      new Request('http://example.test/items/i1'),
      undefined,
    );
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ id: 'i1', name: 'Widget' });
    expect(isRecord(body) && 'secret' in body).toBe(false);
  });
});
