/**
 * Named scenarios for the shared users contract.
 *
 * Each function is one HTTP call + the assertions a learner should connect to
 * the handler code (Result, domain vs host 404, parsed output).
 */
import { expect } from 'vitest';

export type FetchHandler = (
  request: Request,
  context: undefined,
) => Response | Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

/** GET /users — 200 array; no passwordHash on any row. */
export async function listUsers(
  label: string,
  handler: FetchHandler,
): Promise<void> {
  const response = await handler(
    new Request('http://example.test/users'),
    undefined,
  );
  expect(response.status, `${label} GET /users status`).toBe(200);
  const body: unknown = await response.json();
  expect(Array.isArray(body), `${label} GET /users body`).toBe(true);
  if (!Array.isArray(body)) {
    return;
  }
  for (const row of body) {
    expect(isRecord(row) && 'passwordHash' in row, `${label} list leak`).toBe(
      false,
    );
  }
}

/** GET /users/ada — 200; schema fields only (passwordHash stripped). */
export async function getAda(
  label: string,
  handler: FetchHandler,
): Promise<void> {
  const response = await handler(
    new Request('http://example.test/users/ada'),
    undefined,
  );
  expect(response.status, `${label} GET /users/ada status`).toBe(200);
  const body: unknown = await response.json();
  expect(body, `${label} GET /users/ada body`).toEqual({
    id: 'ada',
    name: 'Ada Lovelace',
  });
  expect(
    isRecord(body) && 'passwordHash' in body,
    `${label} getUser must not leak passwordHash`,
  ).toBe(false);
}

/** GET /users/missing — domain miss → code not_found. */
export async function domainNotFound(
  label: string,
  handler: FetchHandler,
): Promise<void> {
  const response = await handler(
    new Request('http://example.test/users/missing'),
    undefined,
  );
  expect(response.status, `${label} GET /users/missing status`).toBe(404);
  const body: unknown = await response.json();
  expect(isRecord(body), `${label} GET /users/missing body`).toBe(true);
  if (isRecord(body)) {
    expect(body.code, `${label} domain miss code`).toBe('not_found');
  }
}

/** GET /nope — host miss → code route_not_found (not domain not_found). */
export async function routeNotFound(
  label: string,
  handler: FetchHandler,
): Promise<void> {
  const response = await handler(
    new Request('http://example.test/nope'),
    undefined,
  );
  expect(response.status, `${label} GET /nope status`).toBe(404);
  const body: unknown = await response.json();
  expect(isRecord(body), `${label} GET /nope body`).toBe(true);
  if (isRecord(body)) {
    expect(body.code, `${label} host miss code`).toBe('route_not_found');
  }
}

/** POST /users — 200 create; passwordHash stripped from wire body. */
export async function createUser(
  label: string,
  handler: FetchHandler,
): Promise<void> {
  const uniqueName = `Smoke User ${crypto.randomUUID()}`;
  const response = await handler(
    new Request('http://example.test/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: uniqueName }),
    }),
    undefined,
  );
  expect(response.status, `${label} POST /users status`).toBe(200);
  const body: unknown = await response.json();
  expect(body, `${label} POST /users body`).toMatchObject({
    name: uniqueName,
  });
  expect(
    isRecord(body) && 'passwordHash' in body,
    `${label} createUser must not leak passwordHash`,
  ).toBe(false);
  if (isRecord(body) && typeof body.id === 'string') {
    expect(body.id.length, `${label} created id`).toBeGreaterThan(0);
  }
}

/** Run every users-contract scenario against one mount. */
export async function runUsersContractScenarios(
  label: string,
  handler: FetchHandler,
): Promise<void> {
  await listUsers(label, handler);
  await getAda(label, handler);
  await domainNotFound(label, handler);
  await routeNotFound(label, handler);
  await createUser(label, handler);
}
