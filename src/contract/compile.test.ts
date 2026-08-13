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
  params: z.object({ id: z.string() }),
  output: z.object({ id: z.string() }),
  errors: { not_found: 404 } as const,
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
        method: 'GET' as const,
        path: '/users',
        output: z.object({ id: z.string() }),
        errors: { not_found: 404 } as const,
      },
      listUsersSlash: {
        method: 'GET' as const,
        path: '/users/',
        output: z.object({ id: z.string() }),
        errors: { not_found: 404 } as const,
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
        params: z.object({ userId: z.string() }),
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
        errors: { internal: 500 } as const,
      },
    } satisfies ContractDef;

    expect(() => compileContract(contract)).toThrow(ContractConfigurationError);
    expect(() => compileContract(contract)).toThrow(
      'Reserved error code "internal" cannot be used as a domain code on operation "getUser"',
    );
  });

  it('throws ContractConfigurationError for reserved host error codes', () => {
    const contract = {
      getUser: {
        ...baseRoute,
        errors: { route_not_found: 404 } as const,
      },
    } satisfies ContractDef;

    expect(() => compileContract(contract)).toThrow(ContractConfigurationError);
    expect(() => compileContract(contract)).toThrow(
      'Reserved error code "route_not_found" cannot be used as a domain code on operation "getUser"',
    );
  });

  it('throws ContractConfigurationError for invalid error status values', () => {
    const contract = {
      getUser: {
        ...baseRoute,
        errors: { not_found: 299 } as const,
      },
    } satisfies ContractDef;

    expect(() => compileContract(contract)).toThrow(ContractConfigurationError);
    expect(() => compileContract(contract)).toThrow(
      'Invalid error status 299 for code "not_found" on operation "getUser"',
    );
  });

  it('throws when path has parameters but no params schema', () => {
    const contract = {
      getUser: {
        method: 'GET' as const,
        path: '/users/:id',
        output: z.object({ id: z.string() }),
        errors: { not_found: 404 } as const,
      },
    } satisfies ContractDef;

    expect(() => compileContract(contract)).toThrow(ContractConfigurationError);
    expect(() => compileContract(contract)).toThrow(
      'Operation "getUser" path has parameters but no params schema',
    );
  });

  it('throws when params schema is declared on a static path', () => {
    const contract = {
      listUsers: {
        method: 'GET' as const,
        path: '/users',
        params: z.object({ id: z.string() }),
        output: z.object({ id: z.string() }),
        errors: {} as const,
      },
    } satisfies ContractDef;

    expect(() => compileContract(contract)).toThrow(ContractConfigurationError);
    expect(() => compileContract(contract)).toThrow(
      'Operation "listUsers" declares params schema but path has no parameters',
    );
  });

  it('throws when GET declares a body schema', () => {
    const contract = {
      badGet: {
        method: 'GET' as const,
        path: '/users',
        body: z.object({ name: z.string() }),
        output: z.object({ id: z.string() }),
        errors: {} as const,
      },
    } satisfies ContractDef;

    expect(() => compileContract(contract)).toThrow(ContractConfigurationError);
    expect(() => compileContract(contract)).toThrow(
      'Operation "badGet" cannot declare body on GET',
    );
  });

  it('throws when DELETE declares a body schema', () => {
    const contract = {
      badDelete: {
        method: 'DELETE' as const,
        path: '/users/:id',
        params: z.object({ id: z.string() }),
        body: z.object({ reason: z.string() }),
        output: z.object({ ok: z.boolean() }),
        errors: {} as const,
      },
    } satisfies ContractDef;

    expect(() => compileContract(contract)).toThrow(ContractConfigurationError);
    expect(() => compileContract(contract)).toThrow(
      'Operation "badDelete" cannot declare body on DELETE',
    );
  });

  it('allows query on POST', () => {
    const contract = {
      createUser: {
        method: 'POST' as const,
        path: '/users',
        query: z.object({ force: z.boolean() }),
        body: z.object({ name: z.string() }),
        output: z.object({ id: z.string() }),
        errors: { conflict: 409 } as const,
      },
    } satisfies ContractDef;

    expect(() => compileContract(contract)).not.toThrow();
  });

  it('allows the same domain code to map to different statuses on different routes', () => {
    const contract = {
      getUser: baseRoute,
      getArchive: {
        method: 'GET' as const,
        path: '/archives/:id',
        params: z.object({ id: z.string() }),
        output: z.object({ id: z.string() }),
        errors: { not_found: 410 } as const,
      },
    } satisfies ContractDef;

    expect(() => compileContract(contract)).not.toThrow();
  });

  it('allows success 204 without an output schema', () => {
    const contract = {
      deleteUser: {
        method: 'DELETE' as const,
        path: '/users/:id',
        params: z.object({ id: z.string() }),
        success: 204,
        errors: { not_found: 404 } as const,
      },
    } satisfies ContractDef;

    expect(() => compileContract(contract)).not.toThrow();
  });

  it('throws when success 204 declares an output schema', () => {
    const contract = {
      deleteUser: {
        method: 'DELETE' as const,
        path: '/users/:id',
        params: z.object({ id: z.string() }),
        success: 204,
        output: z.object({ ok: z.boolean() }),
        errors: { not_found: 404 } as const,
      },
    } satisfies ContractDef;

    expect(() => compileContract(contract)).toThrow(ContractConfigurationError);
    expect(() => compileContract(contract)).toThrow(
      'Operation "deleteUser" with success 204 must not declare an output schema',
    );
  });

  it('throws when success is not 204 and output is missing', () => {
    const contract = {
      getUser: {
        method: 'GET' as const,
        path: '/users/:id',
        params: z.object({ id: z.string() }),
        errors: { not_found: 404 } as const,
      },
    } satisfies ContractDef;

    expect(() => compileContract(contract)).toThrow(ContractConfigurationError);
    expect(() => compileContract(contract)).toThrow(
      'Operation "getUser" must declare an output schema when success is not 204',
    );
  });

  it('throws for invalid success status values', () => {
    const contract = {
      createUser: {
        method: 'POST' as const,
        path: '/users',
        body: z.object({ name: z.string() }),
        output: z.object({ id: z.string() }),
        success: 203,
        errors: {} as const,
      },
    } satisfies ContractDef;

    expect(() => compileContract(contract)).toThrow(ContractConfigurationError);
    expect(() => compileContract(contract)).toThrow(
      'Operation "createUser" declares invalid success status 203',
    );
  });

  it('allows success 201 with an output schema', () => {
    const contract = {
      createUser: {
        method: 'POST' as const,
        path: '/users',
        body: z.object({ name: z.string() }),
        output: z.object({ id: z.string() }),
        success: 201,
        errors: { conflict: 409 } as const,
      },
    } satisfies ContractDef;

    expect(() => compileContract(contract)).not.toThrow();
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
      method: 'GET' as const,
      path: '/users',
      output: z.object({ id: z.string() }),
      errors: { not_found: 404 } as const,
    },
    createUser: {
      method: 'POST' as const,
      path: '/users',
      body: z.object({ name: z.string() }),
      output: z.object({ id: z.string() }),
      errors: { not_found: 404 } as const,
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
