/**
 * Result-preserving query and mutation options for cache layers (e.g. TanStack Query).
 *
 * No React or TanStack dependency — only structural compatibility. Each `queryFn` /
 * `mutationFn` resolves with a `Result` and never rejects, so the railway survives
 * the cache boundary.
 *
 * TanStack's `isError` will not fire for domain failures: errors arrive as fulfilled
 * `Err` data. Branch on `data.isOk()` / `data.isErr()` instead.
 */
export { createMutationOptions, createQueryOptions } from './options.js';
export { isRetryable } from './retry.js';
