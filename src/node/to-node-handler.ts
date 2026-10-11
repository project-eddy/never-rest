import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

import { boundaryError } from '../boundary.js';
import { retryAfterHeaderSeconds } from '../retry-after.js';
import {
  DEFAULT_BODY_TIMEOUT_MS,
  DEFAULT_MAX_BODY_BYTES,
  isContentLengthTooLarge,
  parseContentLength,
} from '../server/body.js';

/** Web-standard fetch handler (e.g. the return value of `serve`, closed over context). */
export type FetchHandler = (request: Request) => Response | Promise<Response>;

/** Node `http` / Express-style request listener produced by `toNodeHandler`. */
export type NodeHttpHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void>;

export interface NodeHandlerOptions {
  readonly maxBodyBytes?: number;
  readonly bodyTimeoutMs?: number;
}

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function requestUrl(req: IncomingMessage): string {
  const host = req.headers.host ?? 'localhost';
  const path = req.url ?? '/';
  const socket = req.socket as IncomingMessage['socket'] & {
    encrypted?: boolean;
  };
  const protocol = socket.encrypted === true ? 'https' : 'http';
  return `${protocol}://${host}${path}`;
}

function headersFromNode(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry);
      }
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

function resolveNodeLimits(options: NodeHandlerOptions | undefined): {
  readonly maxBodyBytes: number;
  readonly bodyTimeoutMs: number;
} {
  return {
    maxBodyBytes: options?.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
    bodyTimeoutMs: options?.bodyTimeoutMs ?? DEFAULT_BODY_TIMEOUT_MS,
  };
}

function writeJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  retryAfterMs?: number,
): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  if (retryAfterMs !== undefined) {
    res.setHeader('retry-after', retryAfterHeaderSeconds(retryAfterMs));
  }
  res.end(JSON.stringify(body));
}

function abortFromClose(controller: AbortController): () => void {
  return () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };
}

function attachCloseSignals(
  req: IncomingMessage,
  res: ServerResponse,
  controller: AbortController,
): () => void {
  const onClose = abortFromClose(controller);
  req.on('close', onClose);
  res.on('close', onClose);
  return () => {
    req.off('close', onClose);
    res.off('close', onClose);
  };
}

function destroyUnread(req: IncomingMessage): void {
  if (!req.readableEnded && !req.destroyed) {
    req.destroy();
  }
}

function contentLengthHeader(req: IncomingMessage): string | null {
  const value = req.headers['content-length'];
  if (value === undefined) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function payloadTooLargeResponse(res: ServerResponse): void {
  const error = boundaryError('boundary.payload_too_large');
  writeJson(res, 413, {
    code: error.code,
    message: error.message,
  });
}

function countingBody(
  stream: ReadableStream<Uint8Array>,
  maxBodyBytes: number,
): ReadableStream<Uint8Array> {
  let total = 0;
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength;
        if (total > maxBodyBytes) {
          controller.error(new Error('payload_too_large'));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}

function toWebRequest(
  req: IncomingMessage,
  signal: AbortSignal,
  maxBodyBytes: number,
): Request {
  const method = (req.method ?? 'GET').toUpperCase();
  const headers = headersFromNode(req);
  const init: RequestInit & { duplex?: 'half' } = { method, headers, signal };

  if (BODY_METHODS.has(method)) {
    init.body = countingBody(
      Readable.toWeb(req) as ReadableStream<Uint8Array>,
      maxBodyBytes,
    );
    init.duplex = 'half';
  }

  return new Request(requestUrl(req), init);
}

async function writeWebResponse(
  webResponse: Response,
  res: ServerResponse,
): Promise<void> {
  res.statusCode = webResponse.status;

  webResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'transfer-encoding') {
      return;
    }
    res.setHeader(key, value);
  });

  if (webResponse.body === null) {
    res.end();
    return;
  }

  const nodeStream = Readable.fromWeb(
    webResponse.body as import('node:stream/web').ReadableStream,
  );
  await new Promise<void>((resolve, reject) => {
    nodeStream.pipe(res);
    nodeStream.on('error', reject);
    res.on('finish', resolve);
    res.on('error', reject);
  });
}

function writeAdapterFailure(res: ServerResponse, error: unknown): void {
  if (!res.headersSent) {
    writeJson(res, 500, {
      code: 'internal',
      message: 'Node adapter failed to handle request',
    });
    return;
  }
  res.destroy(error instanceof Error ? error : undefined);
}

/**
 * Adapt a Web `Request → Response` handler for Node `http` / Express.
 *
 * Streams the incoming body; oversized Content-Length is rejected before the
 * fetch handler runs. Close events abort `Request.signal`. Unread bodies are
 * destroyed after the response.
 */
export function toNodeHandler(
  handler: FetchHandler,
  options?: NodeHandlerOptions,
): NodeHttpHandler {
  const limits = resolveNodeLimits(options);
  return async (req, res) => {
    const controller = new AbortController();
    const detach = attachCloseSignals(req, res, controller);
    try {
      const length = parseContentLength(contentLengthHeader(req));
      if (isContentLengthTooLarge(length, limits.maxBodyBytes)) {
        payloadTooLargeResponse(res);
        destroyUnread(req);
        return;
      }
      const request = toWebRequest(
        req,
        controller.signal,
        limits.maxBodyBytes,
      );
      const response = await handler(request);
      await writeWebResponse(response, res);
      destroyUnread(req);
    } catch (error) {
      writeAdapterFailure(res, error);
    } finally {
      detach();
    }
  };
}
