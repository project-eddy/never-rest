import { serve } from '@eddy-works/never-rest/server';
import { createConcurrencyGate } from '@eddy-works/never-rest/limits';

import { workContract } from './contract.js';
import { runCancellableWork } from './work.js';

export const concurrency = createConcurrencyGate({
  maxInFlight: 1,
  maxQueue: 0,
  queueTimeoutMs: 50,
});

export const api = serve(
  workContract,
  {
    runWork: ({ signal }) => runCancellableWork(signal) as never,
  },
  {
    origin: 'cancellation-example',
    admission: {
      concurrency,
      onStoreFailure: 'reject',
    },
  },
);

export async function dispatch(request: Request): Promise<Response> {
  return api(request, undefined);
}
