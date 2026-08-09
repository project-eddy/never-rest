import type { Result } from 'neverthrow';

import { disclose, type Disclosure } from './disclose.js';
import type { RailError } from './error.js';
import { toDeclaredResponse, type StatusMap } from './status.js';

export interface RespondOptions<
  TCode extends string,
  TSuccess extends number,
  TStatus extends number,
> {
  readonly success: TSuccess;
  readonly statuses: StatusMap<TCode>;
  readonly declared: readonly TStatus[];
  readonly disclosure?: Disclosure;
}

/**
 * Map a neverthrow Result to a { status, body } response.
 * Handlers stay thin: use case → Result → respond.
 */
export function respond<
  TValue,
  TCode extends string,
  TSuccess extends number,
  TStatus extends number,
>(
  result: Result<TValue, RailError<TCode>>,
  options: RespondOptions<TCode, TSuccess, TStatus>,
): { status: TSuccess; body: TValue } | { status: TStatus | 500; body: RailError<TCode> } {
  if (result.isOk()) {
    return { status: options.success, body: result.value };
  }

  const disclosure = options.disclosure ?? 'full';
  const error =
    disclosure === 'full' ? result.error : disclose(result.error, disclosure);

  return toDeclaredResponse(error, options.statuses, options.declared);
}
