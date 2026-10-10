import { railError, type RailError } from './error.js';

export const BOUNDARY_HTTP_ERRORS = {
  'boundary.unauthenticated': { status: 401, retryable: false },
  'boundary.forbidden': { status: 403, retryable: false },
  'boundary.request_timeout': { status: 408, retryable: false },
  'boundary.payload_too_large': { status: 413, retryable: false },
  'boundary.rate_limited': { status: 429, retryable: true },
  'boundary.overloaded': { status: 503, retryable: true },
  'boundary.timeout': { status: 504, retryable: false },
} as const;

export const BOUNDARY_LOCAL_ERRORS = {
  'boundary.cancelled': { status: undefined, retryable: false },
} as const;

export const BOUNDARY_ERRORS = {
  ...BOUNDARY_HTTP_ERRORS,
  ...BOUNDARY_LOCAL_ERRORS,
} as const;

export type BoundaryHttpErrorCode = keyof typeof BOUNDARY_HTTP_ERRORS;
export type BoundaryLocalErrorCode = keyof typeof BOUNDARY_LOCAL_ERRORS;
export type BoundaryErrorCode = keyof typeof BOUNDARY_ERRORS;

const BOUNDARY_MESSAGES: { readonly [K in BoundaryErrorCode]: string } = {
  'boundary.unauthenticated': 'Authentication required',
  'boundary.forbidden': 'Forbidden',
  'boundary.request_timeout': 'Request body timed out',
  'boundary.payload_too_large': 'Request body too large',
  'boundary.rate_limited': 'Too many requests',
  'boundary.overloaded': 'Service overloaded',
  'boundary.timeout': 'Operation timed out',
  'boundary.cancelled': 'Operation cancelled',
};

const HTTP_CODES = new Set<string>(Object.keys(BOUNDARY_HTTP_ERRORS));
const ALL_CODES = new Set<string>(Object.keys(BOUNDARY_ERRORS));

const STATUS_TO_CODE: { readonly [status: number]: BoundaryHttpErrorCode } = {
  401: 'boundary.unauthenticated',
  403: 'boundary.forbidden',
  408: 'boundary.request_timeout',
  413: 'boundary.payload_too_large',
  429: 'boundary.rate_limited',
  503: 'boundary.overloaded',
  504: 'boundary.timeout',
};

export const BOUNDARY_STATUS_MAP: {
  readonly [K in BoundaryHttpErrorCode]: number;
} = {
  'boundary.unauthenticated': 401,
  'boundary.forbidden': 403,
  'boundary.request_timeout': 408,
  'boundary.payload_too_large': 413,
  'boundary.rate_limited': 429,
  'boundary.overloaded': 503,
  'boundary.timeout': 504,
};

export const BOUNDARY_HTTP_STATUSES: readonly number[] = [
  401, 403, 408, 413, 429, 503, 504,
];

export function isBoundaryErrorCode(code: string): code is BoundaryErrorCode {
  return ALL_CODES.has(code);
}

export function isBoundaryHttpErrorCode(
  code: string,
): code is BoundaryHttpErrorCode {
  return HTTP_CODES.has(code);
}

export function isBoundaryPrefix(code: string): boolean {
  return code.startsWith('boundary.');
}

export function boundaryCodeForStatus(
  status: number,
): BoundaryHttpErrorCode | undefined {
  return STATUS_TO_CODE[status];
}

export function boundaryError<TCode extends BoundaryErrorCode>(
  code: TCode,
  extra?: Omit<RailError<TCode>, 'code' | 'message'>,
): RailError<TCode> {
  const retryable = BOUNDARY_ERRORS[code].retryable;
  return railError(code, BOUNDARY_MESSAGES[code], {
    ...(retryable ? { retryable: true } : {}),
    ...extra,
  });
}
