import { errAsync, okAsync, ResultAsync } from 'neverthrow';

import { boundaryError } from '../boundary.js';
import { railError, type RailError } from '../error.js';
import type { ContractDef } from '../contract/types.js';
import type { Policy, VerifyPrincipal } from './types.js';

function verifierFailed(thrown: unknown): RailError<'boundary.unauthenticated'> {
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  return boundaryError('boundary.unauthenticated', {
    cause: railError('internal', message),
  });
}

function runVerify<TPrincipal>(
  verify: VerifyPrincipal<TPrincipal>,
  request: Request,
): ResultAsync<TPrincipal | undefined, RailError<string>> {
  try {
    return ResultAsync.fromSafePromise(Promise.resolve(verify(request))).andThen(
      (result) => result,
    );
  } catch (thrown) {
    return errAsync(verifierFailed(thrown));
  }
}

/** Verify an HTTP caller. Missing verify is anonymous. Verifier throws deny. */
export function verifyHttpPrincipal<TContract extends ContractDef, TPrincipal>(
  policy: Policy<TContract, TPrincipal> | undefined,
  request: Request,
): ResultAsync<TPrincipal | undefined, RailError<string>> {
  if (policy?.verify === undefined) {
    return okAsync(undefined);
  }
  return runVerify(policy.verify, request);
}

/** Local callers supply the principal; a protected operation without one denies. */
export function requireLocalPrincipal<TContract extends ContractDef, TPrincipal>(
  policy: Policy<TContract, TPrincipal> | undefined,
  operation: string,
  principal: TPrincipal | undefined,
): ResultAsync<TPrincipal | undefined, RailError<string>> {
  if (policy === undefined || policy.isPublic(operation)) {
    return okAsync(principal);
  }
  if (principal === undefined) {
    return errAsync(boundaryError('boundary.unauthenticated'));
  }
  return okAsync(principal);
}
