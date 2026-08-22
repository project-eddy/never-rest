/** Maximum cause-chain depth when walking nested `cause` links. */
export const MAX_CAUSE_DEPTH = 16;

/** Validation issue mapped from Standard Schema. */
export interface RailIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

/** Plain serialisable error data that survives a network hop between services. */
export interface RailError<TCode extends string = string> {
  readonly code: TCode;
  readonly message: string;
  readonly issues?: readonly RailIssue[];
  readonly cause?: RailError;
  readonly origin?: string;
  readonly retryable?: boolean;
  readonly nextStep?: string;
  /**
   * Structured context for whoever reads the error — most often an agent
   * deciding what to do next. The named fields cover what every caller needs
   * (`retryable`, `nextStep`, `origin`); `ctx` carries what only this tool
   * knows: which gate rejected, which category, which files were involved.
   *
   * Disclosed at `full` and `internal`, stripped at `public` — the keys are
   * caller-defined, so they cannot be vetted for leakage the way the named
   * fields can.
   */
  readonly ctx?: Readonly<Record<string, unknown>>;
}

/** Construct a rail error with optional context and named fields. */
export function railError<TCode extends string>(
  code: TCode,
  message: string,
  extra?: Omit<RailError<TCode>, 'code' | 'message'>,
): RailError<TCode> {
  if (extra === undefined) {
    return { code, message };
  }

  return { code, message, ...extra };
}

/** Wrap a downstream error as the cause of a caller-facing one. */
export function chain<TCode extends string>(
  outer: Omit<RailError<TCode>, 'cause'>,
  cause: RailError,
): RailError<TCode> {
  return { ...outer, cause };
}

/** List each hop in a cause chain, root-first. */
export function flatten(error: RailError): readonly RailError[] {
  const hops: RailError[] = [];
  const seen = new WeakSet<RailError>();
  let current: RailError | undefined = error;
  let depth = 0;

  while (
    current !== undefined &&
    depth <= MAX_CAUSE_DEPTH &&
    !seen.has(current)
  ) {
    seen.add(current);
    hops.push(current);
    current = current.cause;
    depth += 1;
  }

  return hops;
}

/** Format a cause chain as one line per hop. */
export function formatChain(error: RailError): string {
  return flatten(error)
    .map((hop) => {
      const prefix = hop.origin !== undefined ? `[${hop.origin}] ` : '';
      return `${prefix}${hop.code}: ${hop.message}`;
    })
    .join('\n');
}
