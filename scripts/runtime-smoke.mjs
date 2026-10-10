#!/usr/bin/env node
/**
 * Bun / Deno / Node smoke: bounded POST bodies and a client round trip.
 */

import { ok } from 'neverthrow';

import { createClient } from '../dist/client/index.js';
import { serve } from '../dist/server/index.js';

function objectSchema(shape) {
  return {
    '~standard': {
      version: 1,
      vendor: 'never-rest-smoke',
      validate(value) {
        if (typeof value !== 'object' || value === null) {
          return { issues: [{ message: 'expected object' }] };
        }
        const record = value;
        const parsed = {};
        for (const [key, expected] of Object.entries(shape)) {
          if (typeof record[key] !== expected) {
            return { issues: [{ message: `expected ${key} ${expected}` }] };
          }
          parsed[key] = record[key];
        }
        return { value: parsed };
      },
    },
  };
}

const contract = {
  ping: {
    method: 'POST',
    path: '/ping',
    body: objectSchema({ name: 'string' }),
    output: objectSchema({ name: 'string' }),
    errors: {},
  },
};

const handler = serve(
  contract,
  {
    ping: ({ body }) => ok({ name: body.name }),
  },
  { origin: 'runtime-smoke', limits: { maxBodyBytes: 32 } },
);

const client = createClient(contract, {
  baseUrl: 'http://smoke.local',
  fetch: (input, init) => handler(new Request(input, init), undefined),
});

const success = await client.ping({ body: { name: 'Ada' } });
if (success.isErr() || success.value.name !== 'Ada') {
  throw new Error('runtime-smoke: client round trip failed');
}

const oversized = await handler(
  new Request('http://smoke.local/ping', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'A'.repeat(64) }),
  }),
  undefined,
);

if (oversized.status !== 413) {
  throw new Error(`runtime-smoke: expected 413, got ${oversized.status}`);
}

const body = await oversized.json();
if (body.code !== 'boundary.payload_too_large') {
  throw new Error(`runtime-smoke: unexpected body ${JSON.stringify(body)}`);
}

console.log('runtime-smoke: ok');
