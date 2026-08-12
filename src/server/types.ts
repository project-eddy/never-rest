import type { ContractDef } from '../contract/types.js';
import type { StatusMap } from '../status.js';

export type ContractDomainErrorCode<TContract extends ContractDef> =
  TContract[keyof TContract]['errors'][number];

export type ServerHostErrorCode =
  | 'validation_error'
  | 'internal'
  | 'route_not_found';

export type ServeStatusCode<TContract extends ContractDef> =
  | ContractDomainErrorCode<TContract>
  | ServerHostErrorCode;

export type ServeStatusMap<TContract extends ContractDef> =
  StatusMap<ServeStatusCode<TContract>>;
