import http from 'node:http';
import net from 'node:net';
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

  it('Rejecting an oversized Content-Length before invoking the fetch handler', async () => {
    let invoked = 0;
    const server = http.createServer(
      toNodeHandler(async () => {
        invoked += 1;
        return new Response('ok');
      }, { maxBodyBytes: 16 }),
    );
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
      server.close();
      throw new Error('Expected TCP address');
    }
    try {
      const raw = await new Promise<string>((resolve, reject) => {
        const socket = net.connect(address.port, '127.0.0.1', () => {
          socket.write(
            'POST /unknown HTTP/1.1\r\n' +
              'Host: 127.0.0.1\r\n' +
              'Content-Type: application/json\r\n' +
              'Content-Length: 999999\r\n' +
              'Connection: close\r\n' +
              '\r\n' +
              '{"name":"Ada"}',
          );
        });
        const chunks: Buffer[] = [];
        socket.on('data', (chunk) => chunks.push(chunk));
        socket.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        socket.on('error', reject);
      });
      expect(raw).toContain('413');
      expect(raw).toContain('boundary.payload_too_large');
      expect(invoked).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
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
