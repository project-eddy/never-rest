import { describe, expect, it } from 'vitest';

import { dispatch } from '../cancellation/src/dispatch.js';
import { liveWorkerCount } from '../cancellation/src/work.js';

describe('cancellation example', () => {
  it('terminates the worker and releases the concurrency slot on abort', async () => {
    const controller = new AbortController();
    const pending = dispatch(
      new Request('http://cancel.local/work', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ms: 5000 }),
        signal: controller.signal,
      }),
    );
    controller.abort();
    const response = await pending;
    const body = (await response.json()) as { code: string };

    expect(body.code).toBe('boundary.cancelled');
    expect(liveWorkerCount()).toBe(0);

    const second = await dispatch(
      new Request('http://cancel.local/work', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ms: 1 }),
      }),
    );
    expect(second.status).toBe(200);
    expect(liveWorkerCount()).toBe(0);
  });
});
