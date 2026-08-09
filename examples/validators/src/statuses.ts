// never-rest does not guess statuses — undeclared codes become 500.
export const statuses = {
  validation_error: 400,
  not_found: 404,
  conflict: 409,
  unavailable: 503,
  internal: 500,
} as const;
