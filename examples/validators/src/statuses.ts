// Protocol surface for `serve`: every domain code on the contract plus host
// codes (`validation_error`, `internal`, `route_not_found`). `unavailable`
// is client-only — synthesised on network failure by `createClient`.
export const statuses = {
  validation_error: 400,
  not_found: 404,
  conflict: 409,
  route_not_found: 404,
  internal: 500,
} as const;
