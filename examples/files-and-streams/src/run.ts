/**
 * Files-and-streams demo (Lesson 5) — JSON on the railway, bytes on the host.
 *
 * Flow:
 *   1. POST /jobs (served contract) → JSON job
 *   2. GET /jobs/:id/events (sibling SSE) → text/event-stream
 *   3. POST /uploads (sibling multipart) → JSON asset (shadow RouteDef)
 *   4. GET /assets/:id (served contract / createClient) → same JSON shape
 */
import { createClient } from '@eddy-works/never-rest/client';

import { catalogContract } from './contract.js';
import { dispatch } from './dispatch.js';
import { resetStore } from './store.js';

const client = createClient(catalogContract, {
  baseUrl: 'http://files.local',
  fetch: (input, init) => dispatch(new Request(input, init)),
});

async function main(): Promise<void> {
  resetStore();

  const created = await client.createJob();
  if (created.isErr()) {
    console.error('createJob failed', created.error);
    process.exitCode = 1;
    return;
  }
  console.log('createJob', created.value);

  const events = await dispatch(
    new Request(`http://files.local/jobs/${created.value.id}/events`),
  );
  console.log('events', events.status, events.headers.get('content-type'));
  console.log(await events.text());

  const form = new FormData();
  form.set('title', 'Portrait');
  form.set('file', new File(['hello'], 'portrait.txt', { type: 'text/plain' }));
  const uploaded = await dispatch(
    new Request('http://files.local/uploads', { method: 'POST', body: form }),
  );
  const asset = (await uploaded.json()) as { id: string };
  console.log('upload', uploaded.status, asset);

  const fetched = await client.getAsset({ params: { id: asset.id } });
  console.log('getAsset', fetched.isOk() ? fetched.value : fetched.error);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
