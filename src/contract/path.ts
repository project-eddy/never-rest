export interface CompiledPath {
  readonly regex: RegExp;
  readonly paramNames: readonly string[];
}

function escapeRegexLiteral(segment: string): string {
  return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Compile a contract path such as `/users/:id` into a matcher and param names. */
export function compilePath(path: string): CompiledPath {
  const segments = path.split('/').filter((segment) => segment.length > 0);
  const paramNames: string[] = [];
  const regexParts = segments.map((segment) => {
    if (segment.startsWith(':')) {
      const name = segment.slice(1);
      if (name.length === 0 || segment.indexOf(':', 1) !== -1) {
        throw new Error(`Invalid path parameter segment: ${segment}`);
      }
      paramNames.push(name);
      return '([^/]+)';
    }
    return escapeRegexLiteral(segment);
  });
  const pattern =
    segments.length === 0 ? '^/$' : `^/${regexParts.join('/')}$`;
  return { regex: new RegExp(pattern), paramNames };
}

/** Match a pathname against a compiled path, returning extracted params or undefined. */
export function matchPath(
  compiled: CompiledPath,
  pathname: string,
): Record<string, string> | undefined {
  const match = compiled.regex.exec(pathname);
  if (match === null) {
    return undefined;
  }
  const params: Record<string, string> = {};
  for (let index = 0; index < compiled.paramNames.length; index += 1) {
    const name = compiled.paramNames[index];
    const value = match[index + 1];
    if (name !== undefined && value !== undefined) {
      params[name] = value;
    }
  }
  return params;
}
