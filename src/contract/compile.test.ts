import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  compileContract,
  ContractConfigurationError,
} from './compile.js';
import type { ContractDef } from './types.js';

const baseRoute = {
  method: 'GET' as const,
  path: '/users/:id',
  output: z.object({ id: z.string() }),
  errors: ['not_found'] as const,
};

describe('compileContract', () => {
  it('returns compiled routes and domain error codes', () => {
    const contract = {
      getUser: baseRoute,
    } satisfies ContractDef;

    const compiled = compileContract(contract);

    expect(compiled.contract).toBe(contract);
    expect(compiled.domainErrorCodes.getUser).toEqual(['not_found']);
    expect(compiled.routes.getUser.route).toBe(baseRoute);
    expect(compiled.routes.getUser.compiledPath.paramNames).toEqual(['id']);
    expect(compiled.routes.getUser.compiledPath.regex.test('/users/42')).toBe(true);
  });

  it('throws ContractConfigurationError for duplicate method+path', () => {
    const contract = {
      getUser: baseRoute,
      fetchUser: { ...baseRoute },
    } satisfies ContractDef;

    expect(() => compileContract(contract)).toThrow(ContractConfigurationError);
    expect(() => compileContract(contract)).toThrow(
      'Duplicate route GET /users/:id on operations "getUser" and "fetchUser"',
    );
  });

  it('throws ContractConfigurationError for reserved domain error codes', () => {
    const contract = {
      getUser: {
        ...baseRoute,
        errors: ['internal'] as const,
      },
    } satisfies ContractDef;

    expect(() => compileContract(contract)).toThrow(ContractConfigurationError);
    expect(() => compileContract(contract)).toThrow(
      'Reserved error code "internal" cannot be used as a domain code on operation "getUser"',
    );
  });

  it('throws ContractConfigurationError for duplicate codes within a route', () => {
    const contract = {
      getUser: {
        ...baseRoute,
        errors: ['not_found', 'not_found'] as const,
      },
    } satisfies ContractDef;

    expect(() => compileContract(contract)).toThrow(ContractConfigurationError);
    expect(() => compileContract(contract)).toThrow(
      'Duplicate error code "not_found" on operation "getUser"',
    );
  });
});
