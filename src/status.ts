import type { RailError } from './error.js';

/** Map each declared error code to an HTTP status. */
export type StatusMap<TCode extends string> = { readonly [K in TCode]: number };

/** Map a rail error onto an HTTP status using the supplied code map. */
export function statusFor<TCode extends string>(
  map: StatusMap<TCode>,
  error: RailError<TCode>,
): number {
  return map[error.code];
}

/**
 * Render a rail error as status + body, degrading undeclared statuses to 500.
 * Undeclared statuses degrade rather than leaking an undeclared response shape.
 */
export function toDeclaredResponse<TCode extends string, TStatus extends number>(
  error: RailError<TCode>,
  map: StatusMap<TCode>,
  declared: readonly TStatus[],
): { status: TStatus | 500; body: RailError<TCode> } {
  const status = statusFor(map, error);
  const permitted = (declared as readonly number[]).includes(status);

  return {
    status: permitted ? (status as TStatus) : 500,
    body: error,
  };
}
