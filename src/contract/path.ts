export interface CompiledPath {
  readonly regex: RegExp;
  readonly paramNames: readonly string[];
}

export type PathMatch =
  | { readonly kind: 'match'; readonly params: Record<string, string> }
  | { readonly kind: 'miss' }
  | { readonly kind: 'invalid_encoding'; readonly param: string };

function escapeRegexLiteral(segment: string): string {
  return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Strip trailing slashes so `/users` and `/users/` share one matcher. */
export function normalizePath(path: string): string {
  if (path === '/') {
    return '/';
  }
  let normalized = path;
  while (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function safeDecodeURIComponent(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

/** Compile a contract path such as `/users/:id` into a matcher and param names. */
export function compilePath(path: string): CompiledPath {
  const normalized = normalizePath(path);
  const segments = normalized.split('/').filter((segment) => segment.length > 0);
  const paramNames: string[] = [];
  const seenParamNames = new Set<string>();

  const regexParts = segments.map((segment) => {
    if (segment.startsWith(':')) {
      const name = segment.slice(1);
      if (name.length === 0 || segment.indexOf(':', 1) !== -1) {
        throw new Error(`Invalid path parameter segment: ${segment}`);
      }
      if (seenParamNames.has(name)) {
        throw new Error(`Duplicate path parameter name: ${name}`);
      }
      seenParamNames.add(name);
      paramNames.push(name);
      return '([^/]+)';
    }
    return escapeRegexLiteral(segment);
  });

  const pattern =
    segments.length === 0 ? '^/$' : `^/${regexParts.join('/')}$`;
  return { regex: new RegExp(pattern), paramNames };
}

/** Match a pathname against a compiled path, decoding captures safely. */
export function matchPath(compiled: CompiledPath, pathname: string): PathMatch {
  const match = compiled.regex.exec(pathname);
  if (match === null) {
    return { kind: 'miss' };
  }

  const params: Record<string, string> = {};
  for (let index = 0; index < compiled.paramNames.length; index += 1) {
    const name = compiled.paramNames[index];
    const value = match[index + 1];
    if (name === undefined || value === undefined) {
      continue;
    }
    const decoded = safeDecodeURIComponent(value);
    if (decoded === undefined) {
      return { kind: 'invalid_encoding', param: name };
    }
    params[name] = decoded;
  }

  return { kind: 'match', params };
}
