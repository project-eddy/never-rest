import type { StandardSchemaV1 } from '@standard-schema/spec';

import { compileContract } from '../contract/compile.js';
import type { ContractDef, RouteDef } from '../contract/types.js';
import { HOST_STATUSES } from '../status.js';
import { OpenApiExportError } from './error.js';
import {
  PUBLIC_RAIL_ERROR_SCHEMA,
  railErrorResponse,
  ROUTE_NOT_FOUND_RESPONSE_REF,
} from './rail-error.js';
import {
  convertStandardSchema,
  objectSchemaShape,
  queryParameterName,
} from './schema.js';

export interface OpenApiOptions {
  readonly info: {
    readonly title: string;
    readonly version: string;
    readonly description?: string;
  };
  readonly servers?: readonly {
    readonly url: string;
    readonly description?: string;
  }[];
}

const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}');
}

function methodKey(method: RouteDef['method']): Lowercase<RouteDef['method']> {
  return method.toLowerCase() as Lowercase<RouteDef['method']>;
}

function uniqueStatuses(statuses: readonly number[]): number[] {
  return [...new Set(statuses)];
}

function domainErrorStatuses(route: RouteDef): number[] {
  return uniqueStatuses(Object.values(route.errors));
}

function pathParameters(
  operation: string,
  schema: StandardSchemaV1,
): Record<string, unknown>[] {
  const jsonSchema = convertStandardSchema(operation, 'params', schema, 'input');
  const { properties } = objectSchemaShape(operation, 'params', jsonSchema);

  return Object.entries(properties).map(([name, propertySchema]) => ({
    name,
    in: 'path',
    required: true,
    style: 'simple',
    schema: propertySchema,
  }));
}

function queryParameters(
  operation: string,
  schema: StandardSchemaV1,
): Record<string, unknown>[] {
  const jsonSchema = convertStandardSchema(operation, 'query', schema, 'input');
  const { properties, required } = objectSchemaShape(operation, 'query', jsonSchema);

  return Object.entries(properties).map(([name, propertySchema]) => ({
    name: queryParameterName(name, propertySchema),
    in: 'query',
    required: required.includes(name),
    style: 'form',
    explode: true,
    schema: propertySchema,
  }));
}

function headerParameters(
  operation: string,
  schema: StandardSchemaV1,
): Record<string, unknown>[] {
  const jsonSchema = convertStandardSchema(operation, 'headers', schema, 'input');
  const { properties, required } = objectSchemaShape(operation, 'headers', jsonSchema);

  return Object.entries(properties).map(([name, propertySchema]) => ({
    name,
    in: 'header',
    required: required.includes(name),
    schema: propertySchema,
  }));
}

function requestBody(
  operation: string,
  schema: StandardSchemaV1,
): Record<string, unknown> {
  const jsonSchema = convertStandardSchema(operation, 'body', schema, 'input');
  return {
    required: true,
    content: {
      'application/json': {
        schema: jsonSchema,
      },
    },
  };
}

function successResponse(
  operation: string,
  route: RouteDef,
): Record<string, unknown> {
  const status = route.success ?? 200;

  if (status === 204) {
    return {
      [String(status)]: {
        description: 'No content',
      },
    };
  }

  if (route.output === undefined) {
    throw new OpenApiExportError(
      `Operation "${operation}" declares success ${status} but has no output schema`,
    );
  }

  const schema = convertStandardSchema(operation, 'output', route.output, 'output');
  return {
    [String(status)]: {
      description: 'Success',
      content: {
        'application/json': {
          schema,
        },
      },
    },
  };
}

function domainErrorResponses(route: RouteDef): Record<string, unknown> {
  const responses: Record<string, unknown> = {};
  for (const status of domainErrorStatuses(route)) {
    responses[String(status)] = railErrorResponse('Domain error');
  }
  return responses;
}

function withPathRouteNotFound(
  responses: Record<string, unknown>,
  includeRouteNotFound: boolean,
): Record<string, unknown> {
  if (!includeRouteNotFound) {
    return responses;
  }

  const status = String(HOST_STATUSES.route_not_found);
  if (responses[status] !== undefined) {
    return responses;
  }

  return {
    ...responses,
    [status]: ROUTE_NOT_FOUND_RESPONSE_REF,
  };
}

function buildOperation(
  operation: string,
  route: RouteDef,
  includeRouteNotFound: boolean,
): Record<string, unknown> {
  const parameters: Record<string, unknown>[] = [];

  if (route.params !== undefined) {
    parameters.push(...pathParameters(operation, route.params));
  }
  if (route.query !== undefined) {
    parameters.push(...queryParameters(operation, route.query));
  }
  if (route.headers !== undefined) {
    parameters.push(...headerParameters(operation, route.headers));
  }

  const operationObject: Record<string, unknown> = {
    operationId: operation,
    responses: withPathRouteNotFound(
      {
        ...successResponse(operation, route),
        ...domainErrorResponses(route),
      },
      includeRouteNotFound,
    ),
  };

  if (route.summary !== undefined) {
    operationObject.summary = route.summary;
  }
  if (parameters.length > 0) {
    operationObject.parameters = parameters;
  }
  if (route.body !== undefined) {
    operationObject.requestBody = requestBody(operation, route.body);
  }

  return operationObject;
}

type PathItem = Record<string, unknown>;

/** Produce an OpenAPI 3.1 document from a compiled contract. */
export function toOpenAPI<TContract extends ContractDef>(
  contract: TContract,
  options: OpenApiOptions,
): Record<string, unknown> {
  const compiled = compileContract(contract);
  const paths: Record<string, PathItem> = {};
  const pathRouteNotFoundAdded = new Set<string>();

  for (const [operation, entry] of Object.entries(compiled.routes)) {
    const { route } = entry;
    const openApiPath = toOpenApiPath(route.path);
    const method = methodKey(route.method);
    const includeRouteNotFound = !pathRouteNotFoundAdded.has(openApiPath);

    const pathItem: PathItem = { ...(paths[openApiPath] ?? {}) };
    pathItem[method] = buildOperation(operation, route, includeRouteNotFound);
    paths[openApiPath] = pathItem;

    if (includeRouteNotFound) {
      pathRouteNotFoundAdded.add(openApiPath);
    }
  }

  const document: Record<string, unknown> = {
    openapi: '3.1.0',
    jsonSchemaDialect: JSON_SCHEMA_DIALECT,
    info: { ...options.info },
    components: {
      schemas: {
        RailError: PUBLIC_RAIL_ERROR_SCHEMA,
      },
      responses: {
        RouteNotFound: railErrorResponse('Route not found'),
      },
    },
    paths,
  };

  if (options.servers !== undefined && options.servers.length > 0) {
    document.servers = [...options.servers];
  }

  return document;
}
