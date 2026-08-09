import { serve } from '@eddy-works/never-rest/server';
import type { Disclosure } from '@eddy-works/never-rest';

import { statuses, usersContract } from './contract.js';
import { usersHandlers } from './handlers.js';

export function createUsersServer(options?: {
  readonly origin?: string;
  readonly disclosure?: Disclosure | ((request: Request) => Disclosure);
}): (request: Request, context: undefined) => Promise<Response> {
  return serve(usersContract, usersHandlers, {
    statuses,
    origin: options?.origin ?? 'users-api',
    disclosure: options?.disclosure,
  });
}
