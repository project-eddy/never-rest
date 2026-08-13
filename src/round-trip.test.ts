import http from 'node:http';
import { err, ok, ResultAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createClient } from './client/create.js';
import type { ContractDef } from './contract/types.js';
import { railError } from './error.js';
import { toNodeHandler } from './node/to-node-handler.js';
import { serve, type Handlers } from './server/serve.js';

const roundTripContract = {
  getItem: {
    method: 'GET',
    path: '/items/:id',
    params: z.object({ id: z.string() }),
    output: z.object({ id: z.string(), label: z.string() }),
    errors: { not_found: 404 },
  },
  search: {
    method: 'GET',
    path: '/search',
    query: z.object({ tags: z.array(z.string()) }),
    output: z.object({ tags: z.array(z.string()) }),
    errors: {},
  },
} as const satisfies ContractDef;

type RoundTripContext = undefined;

async function withServer(
  fetchHandler: (request: Request) => Promise<Response>,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = http.createServer(toNodeHandler(fetchHandler));
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('Expected TCP address');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function serveRoundTrip(
  handlers: Handlers<typeof roundTripContract, RoundTripContext>,
  options: Parameters<
    typeof serve<typeof roundTripContract, RoundTripContext>
  >[2] = { origin: 'round-trip' },
) {
  return serve(roundTripContract, handlers, options);
}

describe('HTTP round-trip (toNodeHandler + createClient)', () => {
  it('decodes path captures byte-for-byte over the wire', async () => {
    const seen: string[] = [];
    const handlers: Handlers<typeof roundTripContract, RoundTripContext> = {
      getItem: ({ params }) => {
        seen.push(params.id);
        return ok({ id: params.id, label: 'ok' });
      },
      search: () => ok({ tags: [] }),
    };

    await withServer(serveRoundTrip(handlers), async (baseUrl) => {
      const client = createClient(roundTripContract, { baseUrl });
      const cases = ['hello world', 'a/b', 'café'];

      for (const id of cases) {
        const result = await client.getItem({ params: { id } });
        expect(result.isOk()).toBe(true);
      }

      expect(seen).toEqual(cases);
    });
  });

  it('round-trips array query params', async () => {
    let received: string[] | undefined;
    const handlers: Handlers<typeof roundTripContract, RoundTripContext> = {
      getItem: () => ok({ id: 'x', label: 'x' }),
      search: ({ query }) => {
        received = query.tags;
        return ok({ tags: query.tags });
      },
    };

    await withServer(serveRoundTrip(handlers), async (baseUrl) => {
      const client = createClient(roundTripContract, { baseUrl });
      const result = await client.search({ query: { tags: ['alpha', 'beta'] } });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({ tags: ['alpha', 'beta'] });
      }
      expect(received).toEqual(['alpha', 'beta']);
    });
  });

  it('maps a declared domain error to Err', async () => {
    const handlers: Handlers<typeof roundTripContract, RoundTripContext> = {
      getItem: () => err(railError('not_found', 'Item missing')),
      search: () => ok({ tags: [] }),
    };

    await withServer(serveRoundTrip(handlers), async (baseUrl) => {
      const client = createClient(roundTripContract, { baseUrl });
      const result = await client.getItem({ params: { id: 'missing' } });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('not_found');
        expect(result.error.message).toBe('Item missing');
      }
    });
  });

  it('does not leak forged internal detail at default disclosure', async () => {
    const secret = 'postgres://admin:secret@db.internal';
    const handlers: Handlers<typeof roundTripContract, RoundTripContext> = {
      getItem: () => err(railError('internal', secret) as never),
      search: () => ok({ tags: [] }),
    };

    await withServer(serveRoundTrip(handlers), async (baseUrl) => {
      const client = createClient(roundTripContract, { baseUrl });
      const result = await client.getItem({ params: { id: 'i1' } });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('internal');
        expect(result.error.message).toBe('An unexpected error occurred');
        expect(JSON.stringify(result.error)).not.toContain('postgres://');
        expect(result.error.cause).toBeUndefined();
      }
    });
  });

  it('preserves forged internal detail at full disclosure', async () => {
    const secret = 'postgres://admin:secret@db.internal';
    const handlers: Handlers<typeof roundTripContract, RoundTripContext> = {
      getItem: () => err(railError('internal', secret) as never),
      search: () => ok({ tags: [] }),
    };

    await withServer(
      serveRoundTrip(handlers, { origin: 'round-trip', disclosure: 'full' }),
      async (baseUrl) => {
        const client = createClient(roundTripContract, { baseUrl });
        const result = await client.getItem({ params: { id: 'i1' } });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.code).toBe('internal');
          expect(result.error.message).toBe('An unexpected error occurred');
          expect(result.error.cause).toMatchObject({
            code: 'undeclared_handler_error',
            cause: { code: 'internal', message: secret },
          });
        }
      },
    );
  });

  it('maps a dead server to Err(unavailable)', async () => {
    const server = http.createServer((_req, res) => {
      res.statusCode = 200;
      res.end('{}');
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
      server.close();
      throw new Error('Expected TCP address');
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    const client = createClient(roundTripContract, { baseUrl });
    const result = await client.getItem({ params: { id: 'i1' } });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.retryable).toBe(true);
    }
  });

  it('round-trips a gate railway that returns a declared Err', async () => {
    const handlers: Handlers<typeof roundTripContract, RoundTripContext> = {
      getItem: ({ params }) =>
        (params.id === 'deny'
          ? err(railError('not_found', 'denied'))
          : ok({ userId: params.id })
        ).andThen((session) =>
          ok({ id: session.userId, label: 'ok' }),
        ),
      search: () => ok({ tags: [] }),
    };

    await withServer(serveRoundTrip(handlers), async (baseUrl) => {
      const client = createClient(roundTripContract, { baseUrl });
      const result = await client.getItem({ params: { id: 'deny' } });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('not_found');
      }
    });
  });

  it('round-trips mapErr to forged internal without leaking the secret', async () => {
    const secret = 'postgres://admin:secret@db.internal';
    const handlers: Handlers<typeof roundTripContract, RoundTripContext> = {
      getItem: () =>
        err(railError('not_found', 'missing')).mapErr(
          () => railError('internal', secret) as never,
        ),
      search: () => ok({ tags: [] }),
    };

    await withServer(serveRoundTrip(handlers), async (baseUrl) => {
      const client = createClient(roundTripContract, { baseUrl });
      const result = await client.getItem({ params: { id: 'i1' } });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('internal');
        expect(result.error.message).toBe('An unexpected error occurred');
        expect(JSON.stringify(result.error)).not.toContain('postgres://');
      }
    });
  });

  it('round-trips a ResultAsync lift failure as declared Err', async () => {
    const handlers: Handlers<typeof roundTripContract, RoundTripContext> = {
      getItem: ({ params }) =>
        ResultAsync.fromPromise(Promise.reject(new Error('db')), () =>
          railError('not_found', `Item ${params.id} unavailable`),
        ).map(() => ({ id: params.id, label: 'ok' })),
      search: () => ok({ tags: [] }),
    };

    await withServer(serveRoundTrip(handlers), async (baseUrl) => {
      const client = createClient(roundTripContract, { baseUrl });
      const result = await client.getItem({ params: { id: 'i1' } });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('not_found');
      }
    });
  });
});
