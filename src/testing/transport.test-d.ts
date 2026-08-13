import { z } from 'zod';
import type { ContractDef } from '../contract/types.js';
import type { ContractOutputSamples } from './transport.js';

type Expect<T extends true> = T;

const _sampleContract = {
  getUser: {
    method: 'GET' as const,
    path: '/users/:id',
    output: z.object({ id: z.string(), name: z.string() }),
    errors: { not_found: 404 },
  },
  listUsers: {
    method: 'GET' as const,
    path: '/users',
    output: z.array(z.object({ id: z.string(), name: z.string() })),
    errors: {},
  },
} as const satisfies ContractDef;

type Samples = ContractOutputSamples<typeof _sampleContract>;

type _RequiresEveryOperation = Expect<
  keyof Samples extends 'getUser' | 'listUsers' ? true : false
>;

type IncompleteSamples = { getUser: { id: string; name: string } };

type _RejectsMissingOperation = Expect<
  IncompleteSamples extends Samples ? false : true
>;
