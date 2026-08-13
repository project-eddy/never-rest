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

export type ScenarioOptions = {
  /** Prepended to contract paths (e.g. `/api` for Next basePath mounts). */
  readonly urlPrefix?: string;
  /** When true, skip host-only route_not_found on paths outside the contract. */
  readonly cooperativeMount?: boolean;
};

function contractUrl(path: string, urlPrefix = ''): string {
  return `http://example.test${urlPrefix}${path}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

/** GET /users — 200 array; no passwordHash on any row. */
export async function listUsers(
  label: string,
  handler: FetchHandler,
  options: ScenarioOptions = {},
): Promise<void> {
  const response = await handler(
    new Request(contractUrl('/users', options.urlPrefix)),
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

/** GET /users/ping — 200 when required header is present. */
export async function pingWithHeader(
  label: string,
  handler: FetchHandler,
  options: ScenarioOptions = {},
): Promise<void> {
  const response = await handler(
    new Request(contractUrl('/users/ping', options.urlPrefix), {
      headers: { 'x-request-id': 'conformance-ping' },
    }),
    undefined,
  );
  expect(response.status, `${label} GET /users/ping status`).toBe(200);
  const body: unknown = await response.json();
  expect(body, `${label} GET /users/ping body`).toEqual({ ok: true });
}

/** GET /users/ada — 200; schema fields only (passwordHash stripped). */
export async function getAda(
  label: string,
  handler: FetchHandler,
  options: ScenarioOptions = {},
): Promise<void> {
  const response = await handler(
    new Request(contractUrl('/users/ada', options.urlPrefix)),
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
  options: ScenarioOptions = {},
): Promise<void> {
  const response = await handler(
    new Request(contractUrl('/users/missing', options.urlPrefix)),
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
  options: ScenarioOptions = {},
): Promise<void> {
  const response = await handler(
    new Request(contractUrl('/nope', options.urlPrefix)),
    undefined,
  );
  expect(response.status, `${label} GET /nope status`).toBe(404);
  const body: unknown = await response.json();
  expect(isRecord(body), `${label} GET /nope body`).toBe(true);
  if (isRecord(body)) {
    expect(body.code, `${label} host miss code`).toBe('route_not_found');
  }
}

/** PATCH on a known path — host miss → code route_not_found (cooperative mounts). */
export async function methodNotFoundOnKnownPath(
  label: string,
  handler: FetchHandler,
  options: ScenarioOptions = {},
): Promise<void> {
  const response = await handler(
    new Request(contractUrl('/users/ada', options.urlPrefix), {
      method: 'PATCH',
    }),
    undefined,
  );
  expect(response.status, `${label} PATCH /users/ada status`).toBe(404);
  const body: unknown = await response.json();
  expect(isRecord(body), `${label} PATCH /users/ada body`).toBe(true);
  if (isRecord(body)) {
    expect(body.code, `${label} wrong method code`).toBe('route_not_found');
  }
}

/** POST /users — 201 create; passwordHash stripped from wire body. */
export async function createUser(
  label: string,
  handler: FetchHandler,
  options: ScenarioOptions = {},
): Promise<string | undefined> {
  const uniqueName = `Smoke User ${crypto.randomUUID()}`;
  const response = await handler(
    new Request(contractUrl('/users', options.urlPrefix), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: uniqueName }),
    }),
    undefined,
  );
  expect(response.status, `${label} POST /users status`).toBe(201);
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
    return body.id;
  }
  return undefined;
}

/** DELETE /users/:id — 204 with empty body. */
export async function deleteUser(
  label: string,
  handler: FetchHandler,
  id: string,
  options: ScenarioOptions = {},
): Promise<void> {
  const response = await handler(
    new Request(contractUrl(`/users/${id}`, options.urlPrefix), {
      method: 'DELETE',
    }),
    undefined,
  );
  expect(response.status, `${label} DELETE /users/${id} status`).toBe(204);
  const text = await response.text();
  expect(text, `${label} DELETE /users/${id} body`).toBe('');
}

/** Run every users-contract scenario against one mount. */
export async function runUsersContractScenarios(
  label: string,
  handler: FetchHandler,
  options: ScenarioOptions = {},
): Promise<void> {
  await listUsers(label, handler, options);
  await pingWithHeader(label, handler, options);
  await getAda(label, handler, options);
  await domainNotFound(label, handler, options);
  if (options.cooperativeMount) {
    await methodNotFoundOnKnownPath(label, handler, options);
  } else {
    await routeNotFound(label, handler, options);
  }
  const createdId = await createUser(label, handler, options);
  if (createdId !== undefined) {
    await deleteUser(label, handler, createdId, options);
  }
}
