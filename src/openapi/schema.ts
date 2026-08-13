import type { StandardSchemaV1 } from '@standard-schema/spec';

import { OpenApiExportError } from './error.js';

export type SchemaSource = 'params' | 'query' | 'headers' | 'body' | 'output';

const JSON_SCHEMA_TARGET = 'draft-2020-12' as const;

type JsonSchemaMode = 'input' | 'output';

function converterForMode(
  schema: StandardSchemaV1,
): Record<JsonSchemaMode, (options: { readonly target: typeof JSON_SCHEMA_TARGET }) => Record<string, unknown>> | undefined {
  const vendor = schema['~standard'] as {
    readonly jsonSchema?: {
      readonly input?: (options: {
        readonly target: typeof JSON_SCHEMA_TARGET;
      }) => Record<string, unknown>;
      readonly output?: (options: {
        readonly target: typeof JSON_SCHEMA_TARGET;
      }) => Record<string, unknown>;
    };
  };
  const jsonSchema = vendor.jsonSchema;
  if (jsonSchema === undefined) {
    return undefined;
  }

  if (typeof jsonSchema.input === 'function' && typeof jsonSchema.output === 'function') {
    return jsonSchema as Record<
      JsonSchemaMode,
      (options: { readonly target: typeof JSON_SCHEMA_TARGET }) => Record<string, unknown>
    >;
  }

  return undefined;
}

/** Convert a Standard Schema to JSON Schema or throw `OpenApiExportError`. */
export function convertStandardSchema(
  operation: string,
  source: SchemaSource,
  schema: StandardSchemaV1,
  mode: JsonSchemaMode,
): Record<string, unknown> {
  const converter = converterForMode(schema);
  if (converter === undefined) {
    throw new OpenApiExportError(
      `Operation "${operation}" cannot convert ${source} schema: validator does not support JSON Schema export`,
    );
  }

  try {
    return converter[mode]({ target: JSON_SCHEMA_TARGET });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new OpenApiExportError(
      `Operation "${operation}" cannot convert ${source} schema: ${detail}`,
    );
  }
}

interface ObjectSchemaShape {
  readonly properties: Record<string, Record<string, unknown>>;
  readonly required: readonly string[];
}

/** Extract top-level object properties from a JSON Schema object. */
export function objectSchemaShape(
  operation: string,
  source: SchemaSource,
  schema: Record<string, unknown>,
): ObjectSchemaShape {
  if (schema.type !== 'object') {
    throw new OpenApiExportError(
      `Operation "${operation}" cannot convert ${source} schema: expected an object schema`,
    );
  }

  const properties = schema.properties;
  if (
    properties === undefined ||
    typeof properties !== 'object' ||
    properties === null ||
    Array.isArray(properties)
  ) {
    throw new OpenApiExportError(
      `Operation "${operation}" cannot convert ${source} schema: expected object properties`,
    );
  }

  const requiredValue = schema.required;
  const required =
    Array.isArray(requiredValue) && requiredValue.every((item) => typeof item === 'string')
      ? requiredValue
      : [];

  return {
    properties: properties as Record<string, Record<string, unknown>>,
    required,
  };
}

function isArraySchema(schema: Record<string, unknown>): boolean {
  return schema.type === 'array';
}

/** OpenAPI parameter name for a query field (bracket-array wire encoding). */
export function queryParameterName(propertyName: string, propertySchema: Record<string, unknown>): string {
  return isArraySchema(propertySchema) ? `${propertyName}[]` : propertyName;
}
