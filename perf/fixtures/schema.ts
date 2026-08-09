import { z } from 'zod';

/** Tiny Standard Schema wrapper for perf fixtures. */
export function zodSchema<T extends z.ZodType>(schema: T) {
  return schema as T & import('@standard-schema/spec').StandardSchemaV1;
}
