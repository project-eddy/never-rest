import type { Result, ResultAsync } from 'neverthrow';

import type { ContractDef, HandlerArgsOf, RouteDef } from '../contract/types.js';
import type { Disclosure } from '../disclose.js';
import type { RailError } from '../error.js';

export type PolicyDecision =
  | Result<void, RailError<string>>
  | ResultAsync<void, RailError<string>>;

export interface AuthorizeInput<TRoute extends RouteDef, TPrincipal> {
  readonly principal: TPrincipal | undefined;
  readonly args: HandlerArgsOf<TRoute>;
}

export type OperationPolicy<TRoute extends RouteDef, TPrincipal> =
  | 'public'
  | ((input: AuthorizeInput<TRoute, TPrincipal>) => PolicyDecision);

export type PolicyOperations<TContract extends ContractDef, TPrincipal> = {
  readonly [K in keyof TContract]: OperationPolicy<TContract[K], TPrincipal>;
};

export type VerifyPrincipal<TPrincipal> = (
  request: Request,
) =>
  | Result<TPrincipal | undefined, RailError<string>>
  | ResultAsync<TPrincipal | undefined, RailError<string>>;

export interface PolicyOptions<TContract extends ContractDef, TPrincipal> {
  readonly verify?: VerifyPrincipal<TPrincipal>;
  readonly operations: PolicyOperations<TContract, TPrincipal>;
  readonly disclosure?: (principal: TPrincipal | undefined) => Disclosure;
}

export interface Policy<TContract extends ContractDef, TPrincipal> {
  readonly contract: TContract;
  readonly verify: VerifyPrincipal<TPrincipal> | undefined;
  readonly operations: PolicyOperations<TContract, TPrincipal>;
  disclosureFor(principal: TPrincipal | undefined): Disclosure;
  isPublic(operation: string): boolean;
  authorize(
    operation: string,
    principal: TPrincipal | undefined,
    args: unknown,
  ): ResultAsync<void, RailError<string>>;
}
