import { z } from 'zod';

import type { ContractDef } from '../../contract/types.js';

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const fixtureContract = {
  listUsers: {
    method: 'GET',
    path: '/users',
    query: z.object({
      tags: z.array(z.string()),
      limit: z.number().optional(),
    }),
    output: z.array(userSchema),
    errors: {},
    summary: 'List users',
  },
  getUser: {
    method: 'GET',
    path: '/users/:id',
    params: z.object({ id: z.string() }),
    headers: z.object({ 'x-tenant-id': z.string() }),
    output: userSchema,
    errors: { not_found: 404 },
    summary: 'Get one user',
  },
  createUser: {
    method: 'POST',
    path: '/users',
    body: z.object({ name: z.string() }),
    output: userSchema,
    success: 201,
    errors: { conflict: 409 },
    summary: 'Create a user',
  },
  deleteUser: {
    method: 'DELETE',
    path: '/users/:id',
    params: z.object({ id: z.string() }),
    success: 204,
    errors: { not_found: 404 },
    summary: 'Delete a user',
  },
} satisfies ContractDef;

export const fixtureInfo = {
  title: 'Fixture API',
  version: '1.0.0',
  description: 'Representative contract for OpenAPI export golden tests',
} as const;

export const fixtureServers = [
  { url: 'https://api.example.test', description: 'Fixture server' },
] as const;
