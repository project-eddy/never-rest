import { Worker } from 'node:worker_threads';

import { err, ok, type Result } from 'neverthrow';
import { railError, type RailError } from '@eddy-works/never-rest';

const liveWorkers = new Set<Worker>();

export function liveWorkerCount(): number {
  return liveWorkers.size;
}

const WORKER_SOURCE = `
const { parentPort } = require('node:worker_threads');
const started = Date.now();
while (Date.now() - started < 200) {
  // Busy wait so abort must terminate the worker.
}
parentPort.postMessage('done');
`;

/** Run CPU-bound work in a worker that can be killed when \`signal\` aborts. */
export function runCancellableWork(
  signal: AbortSignal,
): Promise<Result<{ done: true }, RailError<'boundary.cancelled'>>> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(err(railError('boundary.cancelled', 'Operation cancelled')));
      return;
    }

    const worker = new Worker(WORKER_SOURCE, { eval: true });
    liveWorkers.add(worker);
    let settled = false;

    function finish(result: Result<{ done: true }, RailError<'boundary.cancelled'>>) {
      if (settled) {
        return;
      }
      settled = true;
      liveWorkers.delete(worker);
      resolve(result);
    }

    const onAbort = () => {
      void worker.terminate();
      finish(err(railError('boundary.cancelled', 'Operation cancelled')));
    };
    signal.addEventListener('abort', onAbort, { once: true });

    worker.on('message', () => {
      signal.removeEventListener('abort', onAbort);
      finish(ok({ done: true as const }));
    });
    worker.on('error', () => {
      signal.removeEventListener('abort', onAbort);
      finish(err(railError('boundary.cancelled', 'Operation cancelled')));
    });
  });
}
