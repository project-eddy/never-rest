/**
 * Scenario: undeclared handler error + disclosure default.
 * Returning a code not on the route becomes wire `internal`.
 * Omitted disclosure is `public` (cause hidden); `full` keeps the cause.
 */
import { err } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import { railError } from '../error.js';
import { serve, type Handlers } from '../server/serve.js';

import {
  isRecord,
  protocolContract,
} from './fixture.js';

describe('protocol: undeclared handler error', () => {
  const handlers: Handlers<typeof protocolContract, undefined> = {
    getItem: () => err(railError('conflict', 'Unexpected clash') as never),
  };

  it('omitted disclosure → public: internal without cause', async () => {
    const api = serve(protocolContract, handlers, {
      origin: 'protocol-smoke',
      // no disclosure option → public
    });

    const response = await api(
      new Request('http://example.test/items/i1'),
      undefined,
    );
    const body: unknown = await response.json();

    expect(response.status).toBe(500);
    expect(isRecord(body) && body.code).toBe('internal');
    expect(isRecord(body) && body.cause).toBeUndefined();
  });

  it('disclosure full: internal with nested cause', async () => {
    const api = serve(protocolContract, handlers, {
      origin: 'protocol-smoke',
      disclosure: 'full',
    });

    const response = await api(
      new Request('http://example.test/items/i1'),
      undefined,
    );
    const body: unknown = await response.json();

    expect(response.status).toBe(500);
    expect(isRecord(body) && body.code).toBe('internal');
    expect(isRecord(body) && body.cause).toMatchObject({
      code: 'undeclared_handler_error',
      cause: { code: 'conflict', message: 'Unexpected clash' },
    });
  });
});
