import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { ContractDef } from '../contract/types.js';
import { OpenApiExportError } from './error.js';
import { toOpenAPI } from './export.js';
import {
  fixtureContract,
  fixtureInfo,
  fixtureServers,
} from './fixtures/fixture-contract.js';
import expectedDocument from './fixtures/fixture-openapi.json' with { type: 'json' };
import { queryParameterName } from './schema.js';

describe('toOpenAPI', () => {
  it('exports a representative contract matching the golden fixture', () => {
    const document = toOpenAPI(fixtureContract, {
      info: fixtureInfo,
      servers: fixtureServers,
    });

    expect(document).toEqual(expectedDocument);
  });

  it('throws OpenApiExportError when a validator lacks JSON Schema support', () => {
    const contract = {
      createItem: {
        method: 'POST' as const,
        path: '/items',
        body: v.object({ name: v.string() }),
        output: v.object({ id: v.string() }),
        errors: { conflict: 409 },
      },
    } satisfies ContractDef;

    expect(() =>
      toOpenAPI(contract, { info: { title: 'Valibot', version: '0.0.0' } }),
    ).toThrow(OpenApiExportError);
    expect(() =>
      toOpenAPI(contract, { info: { title: 'Valibot', version: '0.0.0' } }),
    ).toThrow(/Operation "createItem" cannot convert (body|output) schema: validator does not support JSON Schema export/);
  });

  it('uses bracket-array wire names for array query parameters', () => {
    const contract = {
      search: {
        method: 'GET' as const,
        path: '/search',
        query: z.object({ tags: z.array(z.string()) }),
        output: z.object({ ids: z.array(z.string()) }),
        errors: {},
      },
    } satisfies ContractDef;

    const document = toOpenAPI(contract, {
      info: { title: 'Query', version: '0.0.0' },
    });

    const parameters = (
      document.paths as Record<
        string,
        { get: { parameters: Record<string, unknown>[] } }
      >
    )['/search'].get.parameters;

    expect(parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'tags[]',
          in: 'query',
          style: 'form',
          explode: true,
        }),
      ]),
    );

    // Matches buildRequest appendQueryValue (`key[]`) in src/client/request.ts.
    expect(queryParameterName('tags', { type: 'array' })).toBe('tags[]');
  });

  it('emits only runtime-producible HTTP statuses', () => {
    const document = toOpenAPI(fixtureContract, { info: fixtureInfo });
    const allowed = new Set([
      200,
      201,
      204,
      404,
      409,
      400,
      500,
    ]);

    const paths = document.paths as Record<
      string,
      Record<string, { responses: Record<string, unknown> }>
    >;

    for (const pathItem of Object.values(paths)) {
      for (const operation of Object.values(pathItem)) {
        if (typeof operation !== 'object' || operation === null) {
          continue;
        }
        const responses = operation.responses;
        if (responses === undefined) {
          continue;
        }
        for (const status of Object.keys(responses)) {
          expect(allowed.has(Number(status)), `unexpected status ${status}`).toBe(
            true,
          );
        }
      }
    }
  });
});
