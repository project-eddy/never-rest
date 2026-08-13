import { describe, expect, it, beforeEach } from 'vitest';

import { createClient } from '@eddy-works/never-rest/client';

import { catalogContract } from '../files-and-streams/src/contract.js';
import { api, dispatch } from '../files-and-streams/src/dispatch.js';
import { resetStore } from '../files-and-streams/src/store.js';

function jsonRequest(path: string, init?: RequestInit): Request {
  return new Request(`http://files.local${path}`, init);
}

describe('files-and-streams host dispatch', () => {
  beforeEach(() => {
    resetStore();
  });

  it('leaves POST /uploads unmatched on handle() and still answers via dispatch', async () => {
    const request = jsonRequest('/uploads', {
      method: 'POST',
      body: (() => {
        const form = new FormData();
        form.set('title', 'Portrait');
        form.set(
          'file',
          new File(['hello'], 'portrait.txt', { type: 'text/plain' }),
        );
        return form;
      })(),
    });

    const cooperative = await api.handle(request, undefined);
    expect(cooperative).toEqual({ matched: false });

    const retry = new FormData();
    retry.set('title', 'Portrait');
    retry.set(
      'file',
      new File(['hello'], 'portrait.txt', { type: 'text/plain' }),
    );
    const uploaded = await dispatch(
      jsonRequest('/uploads', { method: 'POST', body: retry }),
    );
    expect(uploaded.status).toBe(201);
    expect(uploaded.headers.get('content-type')).toBe('application/json');
    const body = (await uploaded.json()) as { id: string; title: string };
    expect(body.title).toBe('Portrait');
    expect(body.id).toMatch(/^asset_/);
  });

  it('returns JSON validation_error when multipart title is missing', async () => {
    const form = new FormData();
    form.set('file', new File(['hello'], 'portrait.txt', { type: 'text/plain' }));
    const response = await dispatch(
      jsonRequest('/uploads', { method: 'POST', body: form }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('validation_error');
  });

  it('round-trips upload JSON through the served getAsset client', async () => {
    const form = new FormData();
    form.set('title', 'Portrait');
    form.set('file', new File(['hello'], 'portrait.txt', { type: 'text/plain' }));
    const uploaded = await dispatch(
      jsonRequest('/uploads', { method: 'POST', body: form }),
    );
    const asset = (await uploaded.json()) as {
      id: string;
      title: string;
      url: string;
      size: number;
    };

    const client = createClient(catalogContract, {
      baseUrl: 'http://files.local',
      fetch: (input, init) => dispatch(new Request(input, init)),
    });

    expect('createJob' in client).toBe(true);
    expect('getAsset' in client).toBe(true);
    expect('upload' in client).toBe(false);

    const fetched = await client.getAsset({ params: { id: asset.id } });
    expect(fetched.isOk()).toBe(true);
    if (fetched.isOk()) {
      expect(fetched.value).toEqual(asset);
    }
  });

  it('streams job events after a successful gate and JSON-errors unknown jobs', async () => {
    const client = createClient(catalogContract, {
      baseUrl: 'http://files.local',
      fetch: (input, init) => dispatch(new Request(input, init)),
    });
    const created = await client.createJob();
    expect(created.isOk()).toBe(true);
    if (created.isErr()) {
      return;
    }

    const stream = await dispatch(
      jsonRequest(`/jobs/${created.value.id}/events`),
    );
    expect(stream.status).toBe(200);
    expect(stream.headers.get('content-type')).toBe('text/event-stream');
    const text = await stream.text();
    expect(text).toContain('"type":"progress"');
    expect(text).toContain('"type":"done"');

    const missing = await dispatch(jsonRequest('/jobs/nope/events'));
    expect(missing.status).toBe(404);
    expect(missing.headers.get('content-type')).toBe('application/json');
    const body = (await missing.json()) as { code: string };
    expect(body.code).toBe('not_found');
  });

  it('does not let the sibling answer a served contract path', async () => {
    const listed = await dispatch(jsonRequest('/assets'));
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual([]);

    const cooperative = await api.handle(jsonRequest('/assets'), undefined);
    expect(cooperative.matched).toBe(true);
  });
});
