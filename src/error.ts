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
}

/** Construct a rail error with optional metadata. */
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
