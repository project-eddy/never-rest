import { describe, expect, it } from 'vitest';
import { compilePath, matchPath, normalizePath } from './path.js';

describe('normalizePath', () => {
  it('strips trailing slashes', () => {
    expect(normalizePath('/users/')).toBe('/users');
    expect(normalizePath('/users')).toBe('/users');
    expect(normalizePath('/')).toBe('/');
  });
});

describe('compilePath', () => {
  it('matches static segments', () => {
    const compiled = compilePath('/users');
    expect(matchPath(compiled, '/users')).toEqual({ kind: 'match', params: {} });
    expect(matchPath(compiled, '/users/extra')).toEqual({ kind: 'miss' });
  });

  it('matches paths with trailing slashes the same as without', () => {
    const compiled = compilePath('/users/');
    expect(matchPath(compiled, '/users')).toEqual({ kind: 'match', params: {} });
    expect(matchPath(compiled, '/users/')).toEqual({ kind: 'miss' });
  });

  it('extracts a single path parameter', () => {
    const compiled = compilePath('/users/:id');
    expect(compiled.paramNames).toEqual(['id']);
    expect(matchPath(compiled, '/users/42')).toEqual({
      kind: 'match',
      params: { id: '42' },
    });
    expect(matchPath(compiled, '/users')).toEqual({ kind: 'miss' });
  });

  it('extracts multiple path parameters', () => {
    const compiled = compilePath('/users/:userId/posts/:postId');
    expect(compiled.paramNames).toEqual(['userId', 'postId']);
    expect(matchPath(compiled, '/users/alice/posts/99')).toEqual({
      kind: 'match',
      params: { userId: 'alice', postId: '99' },
    });
  });

  it('matches the root path', () => {
    const compiled = compilePath('/');
    expect(matchPath(compiled, '/')).toEqual({ kind: 'match', params: {} });
  });

  it('rejects invalid parameter segments', () => {
    expect(() => compilePath('/users/:')).toThrow(/Invalid path parameter/);
    expect(() => compilePath('/users/:id:extra')).toThrow(/Invalid path parameter/);
  });

  it('rejects duplicate parameter names', () => {
    expect(() => compilePath('/a/:id/b/:id')).toThrow(
      /Duplicate path parameter name: id/,
    );
  });
});

describe('matchPath decode round-trip', () => {
  const compiled = compilePath('/echo/:value');

  it('decodes percent-encoded spaces', () => {
    expect(matchPath(compiled, '/echo/hello%20world')).toEqual({
      kind: 'match',
      params: { value: 'hello world' },
    });
  });

  it('decodes percent-encoded slashes', () => {
    expect(matchPath(compiled, '/echo/a%2Fb')).toEqual({
      kind: 'match',
      params: { value: 'a/b' },
    });
  });

  it('decodes UTF-8 sequences', () => {
    expect(matchPath(compiled, '/echo/caf%C3%A9')).toEqual({
      kind: 'match',
      params: { value: 'café' },
    });
  });

  it('decodes double-encoded percent signs', () => {
    expect(matchPath(compiled, '/echo/%252F')).toEqual({
      kind: 'match',
      params: { value: '%2F' },
    });
  });

  it('returns invalid_encoding for malformed percent sequences', () => {
    expect(matchPath(compiled, '/echo/%zz')).toEqual({
      kind: 'invalid_encoding',
      param: 'value',
    });
  });

  it('never throws on malformed percent sequences', () => {
    expect(() => matchPath(compiled, '/echo/%zz')).not.toThrow();
  });
});
