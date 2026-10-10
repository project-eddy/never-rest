import type { ResultAsync } from 'neverthrow';

import type { RailError } from '../error.js';

export type ConsumeResult =
  | { readonly kind: 'allowed' }
  | { readonly kind: 'limited'; readonly retryAfterMs: number };

export interface Limiter {
  consume(
    key: string,
    cost: number,
  ): ResultAsync<ConsumeResult, RailError<'limiter_unavailable'>>;
}

export type StoreFailurePolicy =
  | 'reject'
  | { readonly fallback: Limiter };

export type ConcurrencyRelease = () => void;

export interface ConcurrencyGate {
  acquire(
    signal: AbortSignal,
    cost?: number,
  ): ResultAsync<ConcurrencyRelease, RailError<string>>;
}

export interface AdmissionKeySource {
  readonly request?: Request;
  readonly context?: unknown;
}

export interface AdmissionOptions<TPrincipal> {
  readonly anonymous?: {
    readonly limiter: Limiter;
    readonly key: string | ((source: AdmissionKeySource) => string);
  };
  readonly principal?: {
    readonly limiter: Limiter;
    readonly key: (principal: TPrincipal) => string;
  };
  readonly cost?: (operation: string) => number;
  readonly concurrency?: ConcurrencyGate;
  readonly onStoreFailure: StoreFailurePolicy;
}
