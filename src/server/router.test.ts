import { describe, expect, it } from 'vitest';
import { compilePath, matchPath } from '../contract/path.js';
import { compileRoutes, matchRoute } from './router.js';

describe('compileRoutes', () => {
  it('preserves declaration order', () => {
    const routes = compileRoutes({
      first: { method: 'GET', path: '/a', output: {} as never, errors: [] },
      second: { method: 'GET', path: '/b', output: {} as never, errors: [] },
    });
    expect(routes.map((route) => route.key)).toEqual(['first', 'second']);
  });
});

describe('matchRoute', () => {
  it('matches method and path in declaration order', () => {
    const routes = compileRoutes({
      listUsers: {
        method: 'GET',
        path: '/users',
        output: {} as never,
        errors: [],
      },
      getUser: {
        method: 'GET',
        path: '/users/:id',
        output: {} as never,
        errors: [],
      },
      createUser: {
        method: 'POST',
        path: '/users',
        output: {} as never,
        errors: [],
      },
    });

    expect(matchRoute(routes, 'GET', '/users')?.key).toBe('listUsers');
    expect(matchRoute(routes, 'GET', '/users/alice')?.key).toBe('getUser');
    expect(matchRoute(routes, 'POST', '/users')?.key).toBe('createUser');
    expect(matchRoute(routes, 'DELETE', '/users')).toBeUndefined();
  });

  it('extracts path parameters', () => {
    const compiled = compilePath('/users/:id');
    const routes = [
      {
        key: 'getUser',
        route: {
          method: 'GET' as const,
          path: '/users/:id',
          output: {} as never,
          errors: [] as const,
        },
        compiledPath: compiled,
      },
    ];
    const match = matchRoute(routes, 'GET', '/users/42');
    expect(match?.params).toEqual({ id: '42' });
    expect(matchPath(compiled, '/users/42')).toEqual({ id: '42' });
  });
});
