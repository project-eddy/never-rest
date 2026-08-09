import http from 'node:http';
import { describe, expect, it } from 'vitest';

import { toNodeHandler } from './to-node-handler.js';

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

describe('toNodeHandler', () => {
  it('maps method, path, and JSON body into a Web Request', async () => {
    let seen: { method: string; pathname: string; body: unknown } | undefined;

    await withServer(async (request) => {
      seen = {
        method: request.method,
        pathname: new URL(request.url).pathname,
        body: await request.json(),
      };
      return Response.json({ ok: true }, { status: 201 });
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/users`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test': '1' },
        body: JSON.stringify({ name: 'Ada' }),
      });
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ ok: true });
      expect(seen).toEqual({
        method: 'POST',
        pathname: '/users',
        body: { name: 'Ada' },
      });
    });
  });

  it('forwards response status and headers', async () => {
    await withServer(
      async () =>
        new Response(JSON.stringify({ id: 'u1' }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-origin': 'users-api',
          },
        }),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/users/u1`);
        expect(response.status).toBe(200);
        expect(response.headers.get('x-origin')).toBe('users-api');
        expect(await response.json()).toEqual({ id: 'u1' });
      },
    );
  });

  it('handles GET with no body', async () => {
    await withServer(async (request) => {
      expect(request.method).toBe('GET');
      return new Response('pong', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/ping`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('pong');
    });
  });

  it('returns 500 JSON when the fetch handler throws before headers', async () => {
    await withServer(async () => {
      throw new Error('boom');
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/fail`);
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        code: 'internal',
        message: 'Node adapter failed to handle request',
      });
    });
  });
});
