/** Thrown when a contract cannot be projected into OpenAPI. */
export class OpenApiExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenApiExportError';
  }
}
