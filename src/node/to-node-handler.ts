import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';

/** Web-standard fetch handler (e.g. the return value of `serve`, closed over context). */
export type FetchHandler = (request: Request) => Response | Promise<Response>;

/** Node `http` / Express-style request listener produced by `toNodeHandler`. */
export type NodeHttpHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void>;

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

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const method = (req.method ?? 'GET').toUpperCase();
  const headers = headersFromNode(req);
  const init: RequestInit = { method, headers };

  if (BODY_METHODS.has(method)) {
    const body = await buffer(req);
    if (body.byteLength > 0) {
      init.body = Uint8Array.from(body);
    }
  }

  return new Request(requestUrl(req), init);
}

async function writeWebResponse(
  webResponse: Response,
  res: ServerResponse,
): Promise<void> {
  res.statusCode = webResponse.status;

  webResponse.headers.forEach((value, key) => {
    // Node forbids setting transfer-encoding when Content-Length is set via writeHead paths;
    // setHeader is fine for typical JSON responses from serve().
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

/**
 * Adapt a Web `Request → Response` handler for Node `http` / Express.
 *
 * Thin bridge only — not Express middleware, auth, or body-parser replacement.
 * Close over context when wiring `serve`: `toNodeHandler((req) => handler(req, ctx))`.
 */
export function toNodeHandler(handler: FetchHandler): NodeHttpHandler {
  return async (req, res) => {
    try {
      const request = await toWebRequest(req);
      const response = await handler(request);
      await writeWebResponse(response, res);
    } catch (error) {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            code: 'internal',
            message: 'Node adapter failed to handle request',
          }),
        );
      } else {
        res.destroy(error instanceof Error ? error : undefined);
      }
    }
  };
}
