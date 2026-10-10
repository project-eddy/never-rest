import type { ResultAsync } from 'neverthrow';

import type { ContractDef } from '../contract/types.js';
import type { RailError } from '../error.js';

export type InputSourceKey = 'params' | 'query' | 'body' | 'headers';

export interface McpToolAnnotations {
  readonly readOnlyHint?: boolean;
}

export interface McpToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations?: McpToolAnnotations;
}

export interface McpCallOptions {
  readonly context?: unknown;
  readonly principal?: unknown;
  readonly signal?: AbortSignal;
}

export interface McpDispatcher {
  dispatch(
    operation: string,
    args: unknown,
    options?: McpCallOptions,
  ): ResultAsync<unknown, RailError<string>>;
}

export interface McpRequestExtra {
  readonly signal: AbortSignal;
}

export type ResolvePrincipal = (
  extra: McpRequestExtra,
) => unknown | Promise<unknown>;

export type ResolveContext = (
  extra: McpRequestExtra,
) => unknown | Promise<unknown>;

export interface RegisterContractOptions<TContract extends ContractDef> {
  readonly contract: TContract;
  readonly resolvePrincipal?: ResolvePrincipal;
  readonly resolveContext?: ResolveContext;
}

export interface McpTextContent {
  readonly type: 'text';
  readonly text: string;
}

export interface McpToolResult {
  readonly content: readonly McpTextContent[];
  readonly structuredContent: Record<string, unknown>;
  readonly isError?: true;
}

export interface McpProtocolServer {
  setRequestHandler(
    schema: unknown,
    handler: (
      request: { readonly params: Record<string, unknown> },
      extra: McpRequestExtra,
    ) => Promise<unknown>,
  ): void;
}

export type McpRegisterTarget =
  | McpProtocolServer
  | { readonly server: { readonly setRequestHandler: McpProtocolServer['setRequestHandler'] } };
