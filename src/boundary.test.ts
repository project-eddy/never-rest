import { describe, expect, it } from 'vitest';

import {
  BOUNDARY_STATUS_MAP,
  boundaryCodeForStatus,
  boundaryError,
  isBoundaryErrorCode,
  isBoundaryPrefix,
} from './boundary.js';

describe('boundary errors', () => {
  it('maps HTTP statuses onto reserved boundary codes', () => {
    expect(boundaryCodeForStatus(401)).toBe('boundary.unauthenticated');
    expect(boundaryCodeForStatus(429)).toBe('boundary.rate_limited');
    expect(boundaryCodeForStatus(404)).toBeUndefined();
  });

  it('marks rate and overload errors retryable', () => {
    expect(boundaryError('boundary.rate_limited').retryable).toBe(true);
    expect(boundaryError('boundary.overloaded').retryable).toBe(true);
    expect(boundaryError('boundary.unauthenticated').retryable).toBeUndefined();
  });

  it('rejects the boundary prefix as a domain namespace', () => {
    expect(isBoundaryPrefix('boundary.forbidden')).toBe(true);
    expect(isBoundaryPrefix('forbidden')).toBe(false);
    expect(isBoundaryErrorCode('boundary.cancelled')).toBe(true);
    expect(BOUNDARY_STATUS_MAP['boundary.timeout']).toBe(504);
  });
});
