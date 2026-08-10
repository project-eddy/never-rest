import { expect } from 'vitest';

type FetchHandler = (
  request: Request,
  context: undefined,
) => Response | Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

export async function assertUsersContract(
  label: string,
  handler: FetchHandler,
): Promise<void> {
  const listResponse = await handler(
    new Request('http://example.test/users'),
    undefined,
  );
  expect(listResponse.status, `${label} GET /users status`).toBe(200);
  const listBody: unknown = await listResponse.json();
  expect(Array.isArray(listBody), `${label} GET /users body`).toBe(true);

  const getResponse = await handler(
    new Request('http://example.test/users/ada'),
    undefined,
  );
  expect(getResponse.status, `${label} GET /users/ada status`).toBe(200);
  const ada: unknown = await getResponse.json();
  expect(ada, `${label} GET /users/ada body`).toEqual({
    id: 'ada',
    name: 'Ada Lovelace',
  });

  const missingResponse = await handler(
    new Request('http://example.test/users/missing'),
    undefined,
  );
  expect(missingResponse.status, `${label} GET /users/missing status`).toBe(
    404,
  );
  const missingBody: unknown = await missingResponse.json();
  expect(isRecord(missingBody), `${label} GET /users/missing body`).toBe(true);
  if (isRecord(missingBody)) {
    expect(missingBody.code, `${label} missing error code`).toBe('not_found');
  }

  const uniqueName = `Smoke User ${crypto.randomUUID()}`;
  const createResponse = await handler(
    new Request('http://example.test/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: uniqueName }),
    }),
    undefined,
  );
  expect(createResponse.status, `${label} POST /users status`).toBe(200);
  const created: unknown = await createResponse.json();
  expect(created, `${label} POST /users body`).toMatchObject({
    name: uniqueName,
  });
  if (isRecord(created) && typeof created.id === 'string') {
    expect(created.id.length, `${label} created id`).toBeGreaterThan(0);
  }
}
