import { err, ok } from 'neverthrow';

import { railError } from '@eddy-works/never-rest';
import { serve, type Handlers } from '@eddy-works/never-rest/server';

import { catalogContract } from './contract.js';
import { createJob, getAsset, getJob, listAssets } from './store.js';

/**
 * Return the store record as-is. `serve` / `parseOutput` strip undeclared
 * fields (`bytes` on assets) before the response leaves the process.
 */
const handlers: Handlers<typeof catalogContract, undefined> = {
  listAssets: () => ok(listAssets()),

  getAsset: ({ params }) => {
    const asset = getAsset(params.id);
    if (asset === undefined) {
      return err(railError('not_found', `Asset ${params.id} not found`));
    }
    return ok(asset);
  },

  createJob: () => ok(createJob()),

  getJob: ({ params }) => {
    const job = getJob(params.id);
    if (job === undefined) {
      return err(railError('not_found', `Job ${params.id} not found`));
    }
    return ok(job);
  },
};

export const api = serve(catalogContract, handlers, {
  origin: 'files-and-streams-demo',
});
