import type { StandardSchemaV1 } from '@standard-schema/spec';
import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import type { ContractDef } from '../contract/types.js';
import { railError, type RailError } from '../error.js';
import { parseSchema } from '../contract/parse.js';

function valuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  if (typeof left !== typeof right) {
    return false;
  }
  if (typeof left !== 'object' || left === null || right === null) {
    return false;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }
    return left.every((item, index) => valuesEqual(item, right[index]));
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return false;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key) => valuesEqual(leftRecord[key], rightRecord[key]));
}

function transportUnstable(
  message: string,
  cause?: RailError,
): RailError<'transport_unstable'> {
  return railError('transport_unstable', message, cause ? { cause } : undefined);
}

/**
 * Verify a schema survives JSON wire round-trip: parse, serialise, parse again,
 * and compare the two parsed values.
 */
export function checkTransportStability<T extends StandardSchemaV1>(
  schema: T,
  sample: StandardSchemaV1.InferInput<T>,
): ResultAsync<void, RailError<'transport_unstable'>> {
  return parseSchema(schema, sample)
    .mapErr(() => transportUnstable('Schema rejected the sample input'))
    .andThen((firstParsed) => {
      let wireJson: string;
      try {
        wireJson = JSON.stringify(firstParsed);
      } catch {
        return errAsync(transportUnstable('Parsed value is not JSON-serializable'));
      }

      const wireValue = JSON.parse(wireJson) as unknown;
      return parseSchema(schema, wireValue)
        .mapErr(() => transportUnstable('Schema rejected its wire round-trip'))
        .andThen((secondParsed) => {
          if (!valuesEqual(firstParsed, secondParsed)) {
            return errAsync(
              transportUnstable('Parsed values differ after wire round-trip'),
            );
          }
          return okAsync(undefined);
        });
    });
}

/** One sample per contract operation that declares an output schema. 204 routes are omitted. */
export type ContractOutputSamples<TContract extends ContractDef> = {
  readonly [K in keyof TContract as TContract[K]['output'] extends StandardSchemaV1
    ? K
    : never]: StandardSchemaV1.InferInput<
    Extract<TContract[K]['output'], StandardSchemaV1>
  >;
};

/**
 * Run `checkTransportStability` on every contract output schema.
 * Omitting an operation that declares `output` is a type error. Routes without
 * `output` (`success: 204`) are skipped.
 */
export function checkContractOutputs<TContract extends ContractDef>(
  contract: TContract,
  samples: ContractOutputSamples<TContract>,
): ResultAsync<void, RailError<'transport_unstable'>> {
  const operations = Object.keys(contract) as (keyof TContract & string)[];
  const checks = operations.flatMap((operation) => {
    const output = contract[operation].output;
    if (output === undefined) {
      return [];
    }

    return [
      checkTransportStability(
        output,
        samples[operation as keyof ContractOutputSamples<TContract>],
      ).mapErr((error) =>
        transportUnstable(`Operation "${operation}": ${error.message}`, error),
      ),
    ];
  });
  return ResultAsync.combine(checks).map(() => undefined);
}
