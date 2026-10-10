import { errAsync, okAsync, ResultAsync } from 'neverthrow';

import { boundaryError } from '../boundary.js';
import { ContractConfigurationError } from '../contract/compile.js';
import type { RailError } from '../error.js';
import type {
  AdmissionKeySource,
  AdmissionOptions,
  ConsumeResult,
  ConcurrencyRelease,
  Limiter,
  StoreFailurePolicy,
} from './types.js';

export function assertAdmissionOptions(
  admission: AdmissionOptions<unknown> | undefined,
): void {
  if (admission === undefined) {
    return;
  }
  if (admission.onStoreFailure === undefined) {
    throw new ContractConfigurationError(
      'Admission requires onStoreFailure: "reject" or { fallback }',
    );
  }
}

function resolveKey(
  key: string | ((source: AdmissionKeySource) => string),
  source: AdmissionKeySource,
): string {
  if (typeof key === 'string') {
    return key;
  }
  return key(source);
}

function limitedError(retryAfterMs: number) {
  return boundaryError('boundary.rate_limited', { retryAfterMs, retryable: true });
}

function overloadedError() {
  return boundaryError('boundary.overloaded', { retryable: true });
}

function consumeOrFallback(
  limiter: Limiter,
  key: string,
  cost: number,
  onStoreFailure: StoreFailurePolicy,
): ResultAsync<ConsumeResult, RailError<string>> {
  return limiter.consume(key, cost).orElse(() => {
    if (onStoreFailure === 'reject') {
      return errAsync(overloadedError());
    }
    return onStoreFailure.fallback.consume(key, cost).mapErr(() => {
      return overloadedError();
    });
  });
}

function mapConsume(
  result: ConsumeResult,
): ResultAsync<void, RailError<string>> {
  if (result.kind === 'limited') {
    return errAsync(limitedError(result.retryAfterMs));
  }
  return okAsync(undefined);
}

export function admitLimiter(
  limiter: Limiter,
  key: string,
  cost: number,
  onStoreFailure: StoreFailurePolicy,
): ResultAsync<void, RailError<string>> {
  return consumeOrFallback(limiter, key, cost, onStoreFailure).andThen(mapConsume);
}

export function admitAnonymous<TPrincipal>(
  admission: AdmissionOptions<TPrincipal> | undefined,
  source: AdmissionKeySource,
  operation: string,
): ResultAsync<void, RailError<string>> {
  if (admission?.anonymous === undefined) {
    return okAsync(undefined);
  }
  const cost = admission.cost?.(operation) ?? 1;
  return admitLimiter(
    admission.anonymous.limiter,
    resolveKey(admission.anonymous.key, source),
    cost,
    admission.onStoreFailure,
  );
}

export function admitPrincipal<TPrincipal>(
  admission: AdmissionOptions<TPrincipal> | undefined,
  principal: TPrincipal | undefined,
  operation: string,
): ResultAsync<void, RailError<string>> {
  if (admission?.principal === undefined || principal === undefined) {
    return okAsync(undefined);
  }
  const cost = admission.cost?.(operation) ?? 1;
  return admitLimiter(
    admission.principal.limiter,
    admission.principal.key(principal),
    cost,
    admission.onStoreFailure,
  );
}

export function acquireConcurrency<TPrincipal>(
  admission: AdmissionOptions<TPrincipal> | undefined,
  signal: AbortSignal,
  operation: string,
): ResultAsync<ConcurrencyRelease, RailError<string>> {
  if (admission?.concurrency === undefined) {
    return okAsync(() => undefined);
  }
  const cost = admission.cost?.(operation) ?? 1;
  return admission.concurrency.acquire(signal, cost);
}
