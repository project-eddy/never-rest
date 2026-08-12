import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  assertHandlersComplete,
  compileContract,
  ContractConfigurationError,
  isContractPath,
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

  it('throws ContractConfigurationError for trailing-slash collision', () => {
    const contract = {
      listUsers: {
        ...baseRoute,
        path: '/users',
      },
      listUsersSlash: {
        ...baseRoute,
        path: '/users/',
      },
    } satisfies ContractDef;

    expect(() => compileContract(contract)).toThrow(ContractConfigurationError);
    expect(() => compileContract(contract)).toThrow(
      'Duplicate route GET /users/ on operations "listUsers" and "listUsersSlash"',
    );
  });

  it('throws ContractConfigurationError for duplicate compiled matchers', () => {
    const contract = {
      getById: {
        ...baseRoute,
        path: '/users/:id',
      },
      getByUserId: {
        ...baseRoute,
        path: '/users/:userId',
      },
    } satisfies ContractDef;

    expect(() => compileContract(contract)).toThrow(ContractConfigurationError);
    expect(() => compileContract(contract)).toThrow(
      'Duplicate route matcher GET /users/:userId on operations "getById" and "getByUserId"',
    );
  });

  it('throws ContractConfigurationError for duplicate path parameter names', () => {
    const contract = {
      badPath: {
        ...baseRoute,
        path: '/a/:id/b/:id',
      },
    } satisfies ContractDef;

    expect(() => compileContract(contract)).toThrow(ContractConfigurationError);
    expect(() => compileContract(contract)).toThrow(
      'Invalid path on operation "badPath": Duplicate path parameter name: id',
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

describe('assertHandlersComplete', () => {
  it('throws when a handler is missing', () => {
    const contract = {
      getUser: baseRoute,
      deleteUser: { ...baseRoute, method: 'DELETE' as const },
    } satisfies ContractDef;

    const compiled = compileContract(contract);

    expect(() =>
      assertHandlersComplete(compiled, {
        getUser: async () => {},
      }),
    ).toThrow(ContractConfigurationError);
    expect(() =>
      assertHandlersComplete(compiled, {
        getUser: async () => {},
      }),
    ).toThrow('Missing handler for operation "deleteUser"');
  });

  it('throws when a handler is not a function', () => {
    const contract = {
      getUser: baseRoute,
    } satisfies ContractDef;

    const compiled = compileContract(contract);

    expect(() =>
      assertHandlersComplete(compiled, {
        getUser: 'not-a-function',
      }),
    ).toThrow(ContractConfigurationError);
    expect(() =>
      assertHandlersComplete(compiled, {
        getUser: 'not-a-function',
      }),
    ).toThrow('Missing handler for operation "getUser"');
  });

  it('passes when every operation has a function handler', () => {
    const contract = {
      getUser: baseRoute,
    } satisfies ContractDef;

    const compiled = compileContract(contract);

    expect(() =>
      assertHandlersComplete(compiled, {
        getUser: async () => {},
      }),
    ).not.toThrow();
  });
});

describe('isContractPath', () => {
  const contract = {
    getUser: baseRoute,
    listUsers: {
      ...baseRoute,
      path: '/users',
    },
    createUser: {
      ...baseRoute,
      method: 'POST' as const,
      path: '/users',
    },
  } satisfies ContractDef;

  const compiled = compileContract(contract);

  it('matches a parameterized contract path', () => {
    expect(isContractPath(compiled, '/users/ada')).toBe(true);
  });

  it('matches a static path shared by two methods', () => {
    expect(isContractPath(compiled, '/users')).toBe(true);
  });

  it('rejects a path that is not on the contract', () => {
    expect(isContractPath(compiled, '/sign-in')).toBe(false);
    expect(isContractPath(compiled, '/users/ada/settings')).toBe(false);
  });

  it('treats invalid percent-encoding as a contract path', () => {
    expect(isContractPath(compiled, '/users/%zz')).toBe(true);
  });
});
