/** Shared protocol assertions for railway boundary tests (not a package export). */

const HOST_CODES = new Set([
  'validation_error',
  'internal',
  'route_not_found',
]);

const CONSTANT_INTERNAL_MESSAGE = 'An unexpected error occurred';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function assertErrorEnvelope(
  body: Record<string, unknown>,
  declaredCodes: readonly string[],
  disclosure: 'public' | 'full' | 'internal',
  expect: typeof import('vitest').expect,
): void {
  expect(typeof body.code).toBe('string');
  expect(typeof body.message).toBe('string');

  const allowed = new Set([...declaredCodes, ...HOST_CODES]);
  expect(allowed.has(body.code as string)).toBe(true);

  if (disclosure === 'public') {
    expect(body.cause).toBeUndefined();
    if (body.code === 'internal') {
      expect(body.message).toBe(CONSTANT_INTERNAL_MESSAGE);
    }
  }
}

/** Assert serve() protocol invariants for any handler outcome. */
export async function assertProtocolResponse(options: {
  readonly response: Response;
  readonly declaredCodes: readonly string[];
  readonly disclosure?: 'public' | 'full' | 'internal';
  readonly forbidSubstrings?: readonly string[];
  readonly expect: typeof import('vitest').expect;
}): Promise<Record<string, unknown> | unknown> {
  const {
    response,
    declaredCodes,
    disclosure = 'public',
    forbidSubstrings = [],
    expect,
  } = options;

  expect(response.headers.get('content-type')).toContain('application/json');
  const text = await response.text();
  expect(() => JSON.parse(text)).not.toThrow();
  const body: unknown = JSON.parse(text);

  if (response.status >= 200 && response.status < 300) {
    return body;
  }

  expect(isRecord(body)).toBe(true);
  if (!isRecord(body)) {
    return body;
  }

  assertErrorEnvelope(body, declaredCodes, disclosure, expect);

  const serialised = JSON.stringify(body);
  for (const secret of forbidSubstrings) {
    expect(serialised).not.toContain(secret);
  }

  return body;
}
