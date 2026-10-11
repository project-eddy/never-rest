import { errAsync, okAsync, ResultAsync } from 'neverthrow';

import { boundaryError } from '../boundary.js';
import { ContractConfigurationError } from '../contract/compile.js';
import type { ContractDef } from '../contract/types.js';
import type { Disclosure } from '../disclose.js';
import { railError, type RailError } from '../error.js';
import type {
  OperationPolicy,
  Policy,
  PolicyDecision,
  PolicyOptions,
  VerifyPrincipal,
} from './types.js';

function defaultDisclosure(): Disclosure {
  return 'public';
}

function isOperationPolicy(value: unknown): value is OperationPolicy<never, never> {
  return value === 'public' || typeof value === 'function';
}

function assertPolicyCoverage(
  contract: ContractDef,
  operations: object,
): void {
  const declared = operations as Record<string, unknown>;
  for (const operation of Object.keys(contract)) {
    if (!isOperationPolicy(declared[operation])) {
      throw new ContractConfigurationError(
        `Missing policy for operation "${operation}"`,
      );
    }
  }
  for (const operation of Object.keys(declared)) {
    if (!(operation in contract)) {
      throw new ContractConfigurationError(
        `Unknown policy operation "${operation}"`,
      );
    }
  }
}

type Authorizer = (input: {
  readonly principal: unknown;
  readonly args: unknown;
}) => PolicyDecision;

function toDecision(value: PolicyDecision): ResultAsync<void, RailError<string>> {
  return ResultAsync.fromSafePromise(Promise.resolve(value)).andThen(
    (result) => result,
  );
}

function authorizePublic(): ResultAsync<void, RailError<string>> {
  return okAsync(undefined);
}

function missingPrincipal(): ResultAsync<void, RailError<string>> {
  return errAsync(boundaryError('boundary.unauthenticated'));
}

function authorizerFailed(thrown: unknown): RailError<'boundary.forbidden'> {
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  return boundaryError('boundary.forbidden', {
    cause: railError('internal', message),
  });
}

function runAuthorizer(
  authorizer: Authorizer,
  principal: unknown,
  args: unknown,
): ResultAsync<void, RailError<string>> {
  try {
    return toDecision(authorizer({ principal, args }));
  } catch (thrown) {
    return errAsync(authorizerFailed(thrown));
  }
}

function authorizeOperation(
  entry: OperationPolicy<never, never> | undefined,
  principal: unknown,
  args: unknown,
): ResultAsync<void, RailError<string>> {
  if (entry === undefined) {
    return errAsync(boundaryError('boundary.forbidden'));
  }
  if (entry === 'public') {
    return authorizePublic();
  }
  if (principal === undefined) {
    return missingPrincipal();
  }
  return runAuthorizer(entry as Authorizer, principal, args);
}

/**
 * Register a policy that covers every operation. Missing, unknown, or
 * malformed entries fail at construction — not at the first request.
 */
export function definePolicy<
  TContract extends ContractDef,
  TPrincipal = unknown,
>(
  contract: TContract,
  options: PolicyOptions<TContract, TPrincipal>,
): Policy<TContract, TPrincipal> {
  assertPolicyCoverage(contract, options.operations);
  const disclosure = options.disclosure ?? defaultDisclosure;
  const operations = options.operations as Record<
    string,
    OperationPolicy<never, never>
  >;

  return {
    contract,
    verify: options.verify as VerifyPrincipal<TPrincipal> | undefined,
    operations: options.operations,
    disclosureFor(principal) {
      return disclosure(principal);
    },
    isPublic(operation) {
      return operations[operation] === 'public';
    },
    authorize(operation, principal, args) {
      return authorizeOperation(operations[operation], principal, args);
    },
  };
}
