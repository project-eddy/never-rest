import type { ContractDef } from '../contract/types.js';
import type { Disclosure } from '../disclose.js';
import type { HostStatuses } from '../status.js';

export type ContractDomainErrorCode<TContract extends ContractDef> =
  keyof TContract[keyof TContract]['errors'] & string;

export type ServerHostErrorCode =
  | 'validation_error'
  | 'internal'
  | 'route_not_found';

export interface ServeOptions {
  readonly disclosure?: Disclosure | ((request: Request) => Disclosure);
  readonly origin?: string;
  /** Stripped before matching. No trailing slash. */
  readonly basePath?: `/${string}`;
  readonly hostStatuses?: Partial<HostStatuses>;
}

export interface ServeHandler<TContext> {
  (request: Request, context: TContext): Promise<Response>;
  /**
   * Cooperative mount. `matched` is false only when the path is outside
   * `basePath` or outside the contract path set — use for SSE, uploads, or
   * other non-JSON handlers that share a host with the contract.
   */
  handle(
    request: Request,
    context: TContext,
  ): Promise<{ matched: false } | { matched: true; response: Response }>;
}
