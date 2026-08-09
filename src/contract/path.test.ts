import { describe, expect, it } from 'vitest';
import { compilePath, matchPath } from './path.js';

describe('compilePath', () => {
  it('matches static segments', () => {
    const compiled = compilePath('/users');
    expect(matchPath(compiled, '/users')).toEqual({});
    expect(matchPath(compiled, '/users/extra')).toBeUndefined();
  });

  it('extracts a single path parameter', () => {
    const compiled = compilePath('/users/:id');
    expect(compiled.paramNames).toEqual(['id']);
    expect(matchPath(compiled, '/users/42')).toEqual({ id: '42' });
    expect(matchPath(compiled, '/users')).toBeUndefined();
  });

  it('extracts multiple path parameters', () => {
    const compiled = compilePath('/users/:userId/posts/:postId');
    expect(compiled.paramNames).toEqual(['userId', 'postId']);
    expect(matchPath(compiled, '/users/alice/posts/99')).toEqual({
      userId: 'alice',
      postId: '99',
    });
  });

  it('matches the root path', () => {
    const compiled = compilePath('/');
    expect(matchPath(compiled, '/')).toEqual({});
  });

  it('rejects invalid parameter segments', () => {
    expect(() => compilePath('/users/:')).toThrow(/Invalid path parameter/);
    expect(() => compilePath('/users/:id:extra')).toThrow(/Invalid path parameter/);
  });
});
