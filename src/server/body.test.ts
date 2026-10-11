import { describe, expect, it } from 'vitest';

import { readBoundedJsonBody, resolveBodyLimits } from './body.js';

function delayedStream(chunks: Uint8Array[], delayMs: number): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream({
    async pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      controller.enqueue(chunks[index]);
      index += 1;
    },
  });
}

describe('readBoundedJsonBody', () => {
  it('Rejecting an oversized Content-Length before reading bytes', async () => {
    const { isContentLengthTooLarge, parseContentLength } = await import('./body.js');
    expect(isContentLengthTooLarge(parseContentLength('9999999'), 16)).toBe(true);

    const request = new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'content-length': '32', 'content-type': 'application/json' },
      body: '{"name":"Ada"}',
    });
    request.headers.set('content-length', '9999999');

    const result = await readBoundedJsonBody(
      request,
      resolveBodyLimits({ maxBodyBytes: 16 }),
    );

    expect(result._unsafeUnwrapErr().code).toBe('boundary.payload_too_large');
  });

  it('Bounding a chunked body with no Content-Length', async () => {
    const request = new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(64),
    });

    const result = await readBoundedJsonBody(
      request,
      resolveBodyLimits({ maxBodyBytes: 8 }),
    );

    expect(result._unsafeUnwrapErr().code).toBe('boundary.payload_too_large');
  });

  it('Timing out a slow trickle', async () => {
    const request = new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: delayedStream([new TextEncoder().encode('{"n":1}')], 50),
      // @ts-expect-error duplex is required for streamed Request bodies in Node
      duplex: 'half',
    });

    const result = await readBoundedJsonBody(
      request,
      resolveBodyLimits({ maxBodyBytes: 1024, bodyTimeoutMs: 5 }),
    );

    expect(result._unsafeUnwrapErr().code).toBe('boundary.request_timeout');
  });

  it('returns validation_error for invalid JSON', async () => {
    const request = new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    const result = await readBoundedJsonBody(request, resolveBodyLimits());
    expect(result._unsafeUnwrapErr().code).toBe('validation_error');
  });

  it('returns validation_error for a fatal decode', async () => {
    const request = new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: new Uint8Array([0xff, 0xfe, 0xfd]),
    });
    const result = await readBoundedJsonBody(request, resolveBodyLimits());
    expect(result._unsafeUnwrapErr().code).toBe('validation_error');
  });

  it('returns cancelled when the request is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const request = new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ada' }),
      signal: controller.signal,
    });
    const result = await readBoundedJsonBody(request, resolveBodyLimits());
    expect(result._unsafeUnwrapErr().code).toBe('boundary.cancelled');
  });

  it('maps stream TimeoutError to request_timeout', async () => {
    const request = new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: new ReadableStream({
        pull() {
          throw new DOMException('slow', 'TimeoutError');
        },
      }),
      // @ts-expect-error duplex is required for streamed Request bodies in Node
      duplex: 'half',
    });
    const result = await readBoundedJsonBody(request, resolveBodyLimits());
    expect(result._unsafeUnwrapErr().code).toBe('boundary.request_timeout');
  });

  it('maps stream AbortError to cancelled', async () => {
    const request = new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: new ReadableStream({
        pull() {
          throw new DOMException('stopped', 'AbortError');
        },
      }),
      // @ts-expect-error duplex is required for streamed Request bodies in Node
      duplex: 'half',
    });
    const result = await readBoundedJsonBody(request, resolveBodyLimits());
    expect(result._unsafeUnwrapErr().code).toBe('boundary.cancelled');
  });

  it('maps other stream failures to validation_error', async () => {
    const request = new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: new ReadableStream({
        pull() {
          throw new Error('socket reset');
        },
      }),
      // @ts-expect-error duplex is required for streamed Request bodies in Node
      duplex: 'half',
    });
    const result = await readBoundedJsonBody(request, resolveBodyLimits());
    expect(result._unsafeUnwrapErr().code).toBe('validation_error');
  });

  it('parses a valid JSON body under the limit', async () => {
    const request = new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ada' }),
    });

    const result = await readBoundedJsonBody(request, resolveBodyLimits());

    expect(result._unsafeUnwrap()).toEqual({ name: 'Ada' });
  });
});
