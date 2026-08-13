/**
 * Public RailError wire shape after `disclose(error, 'public')`.
 * Cause and origin are stripped; issue paths may be empty on public surfaces.
 */
export const PUBLIC_RAIL_ERROR_SCHEMA = {
  type: 'object',
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: {
            type: 'array',
            items: {
              type: ['string', 'number'],
            },
          },
          message: { type: 'string' },
        },
        required: ['path', 'message'],
        additionalProperties: false,
      },
    },
    retryable: { type: 'boolean' },
    nextStep: { type: 'string' },
  },
  required: ['code', 'message'],
  additionalProperties: false,
} as const;

export function railErrorResponse(description: string): Record<string, unknown> {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/RailError' },
      },
    },
  };
}

export const ROUTE_NOT_FOUND_RESPONSE_REF = {
  $ref: '#/components/responses/RouteNotFound',
} as const;
