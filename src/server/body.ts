import { err, ok, type Result } from 'neverthrow';

import { boundaryError } from '../boundary.js';
import { railError, type RailError } from '../error.js';

export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
export const DEFAULT_BODY_TIMEOUT_MS = 30_000;

export interface BodyLimits {
  readonly maxBodyBytes: number;
  readonly bodyTimeoutMs: number;
}

type BodyReadError = RailError<
  | 'validation_error'
  | 'boundary.payload_too_large'
  | 'boundary.request_timeout'
  | 'boundary.cancelled'
>;

export function resolveBodyLimits(
  limits?: { readonly maxBodyBytes?: number; readonly bodyTimeoutMs?: number },
): BodyLimits {
  return {
    maxBodyBytes: limits?.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
    bodyTimeoutMs: limits?.bodyTimeoutMs ?? DEFAULT_BODY_TIMEOUT_MS,
  };
}

/** Parse a Content-Length header; invalid values are ignored. */
export function parseContentLength(value: string | null): number | undefined {
  if (value === null || value === '') {
    return undefined;
  }
  if (!/^\d+$/.test(value)) {
    return undefined;
  }
  const length = Number(value);
  if (!Number.isSafeInteger(length)) {
    return undefined;
  }
  return length;
}

export function isContentLengthTooLarge(
  contentLength: number | undefined,
  maxBodyBytes: number,
): boolean {
  return contentLength !== undefined && contentLength > maxBodyBytes;
}

function concatBytes(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function readFailed(): RailError<'validation_error'> {
  return railError('validation_error', 'Validation failed', {
    issues: [{ path: ['body'], message: 'Could not read request body' }],
  });
}

function invalidJson(): RailError<'validation_error'> {
  return railError('validation_error', 'Validation failed', {
    issues: [{ path: ['body'], message: 'Invalid JSON body' }],
  });
}

async function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // Reader may already be closed.
  }
}

function streamReadError(error: unknown): BodyReadError {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return boundaryError('boundary.request_timeout');
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return boundaryError('boundary.cancelled');
  }
  return readFailed();
}

async function pushChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  chunks: Uint8Array[],
  total: number,
  chunk: Uint8Array,
  maxBodyBytes: number,
): Promise<Result<number, BodyReadError>> {
  const nextTotal = total + chunk.byteLength;
  if (nextTotal > maxBodyBytes) {
    await cancelReader(reader);
    return err(boundaryError('boundary.payload_too_large'));
  }
  chunks.push(chunk);
  return ok(nextTotal);
}

async function readCountedBytes(
  body: ReadableStream<Uint8Array>,
  maxBodyBytes: number,
): Promise<Result<Uint8Array, BodyReadError>> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return ok(concatBytes(chunks, total));
      }
      if (value === undefined) {
        continue;
      }
      const pushed = await pushChunk(reader, chunks, total, value, maxBodyBytes);
      if (pushed.isErr()) {
        return err(pushed.error);
      }
      total = pushed.value;
    }
  } catch (error) {
    return err(streamReadError(error));
  }
}

function decodeJsonBytes(bytes: Uint8Array): Result<unknown, BodyReadError> {
  if (bytes.byteLength === 0) {
    return ok(undefined);
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return err(invalidJson());
  }

  try {
    return ok(JSON.parse(text) as unknown);
  } catch {
    return err(invalidJson());
  }
}

function listenForAbort(
  signal: AbortSignal,
  resolve: (error: BodyReadError) => void,
  error: BodyReadError,
): () => void {
  if (signal.aborted) {
    resolve(error);
    return () => undefined;
  }
  const onAbort = () => resolve(error);
  signal.addEventListener('abort', onAbort, { once: true });
  return () => signal.removeEventListener('abort', onAbort);
}

function abortAsBodyError(
  timeout: AbortSignal,
  requestSignal: AbortSignal,
): Promise<Result<Uint8Array, BodyReadError>> {
  return new Promise((resolve) => {
    listenForAbort(timeout, (error) => resolve(err(error)), boundaryError('boundary.request_timeout'));
    listenForAbort(
      requestSignal,
      (error) => resolve(err(error)),
      boundaryError('boundary.cancelled'),
    );
  });
}

async function readBodyBytes(
  request: Request,
  limits: BodyLimits,
): Promise<Result<Uint8Array, BodyReadError>> {
  if (request.body === null) {
    return ok(new Uint8Array());
  }

  const timeout = AbortSignal.timeout(limits.bodyTimeoutMs);
  return Promise.race([
    readCountedBytes(request.body, limits.maxBodyBytes),
    abortAsBodyError(timeout, request.signal),
  ]);
}

/**
 * Read a JSON request body with a byte cap and a total-time deadline.
 * Oversized Content-Length is rejected before any bytes are consumed.
 */
export async function readBoundedJsonBody(
  request: Request,
  limits: BodyLimits,
): Promise<Result<unknown, BodyReadError>> {
  const contentLength = parseContentLength(request.headers.get('content-length'));
  if (isContentLengthTooLarge(contentLength, limits.maxBodyBytes)) {
    return err(boundaryError('boundary.payload_too_large'));
  }

  const bytes = await readBodyBytes(request, limits);
  if (bytes.isErr()) {
    return err(bytes.error);
  }
  return decodeJsonBytes(bytes.value);
}
