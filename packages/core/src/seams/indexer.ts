import { PassportError } from '../passport-error.js';
import type { StateSource } from '../state-source.js';
import type { BlockRef, CallOptions, ContractAddress, TransactionId } from './common.js';
import type { TransactionStatus } from './transaction.js';

export interface ContractState {
  readonly address: ContractAddress;
  /** The serialized ledger contract state. */
  readonly bytes: Uint8Array;
  readonly block: BlockRef;
}

export interface LedgerParametersRead {
  /** The serialized ledger parameters: the cost model that the node checks a transaction with. */
  readonly bytes: Uint8Array;
  readonly block: BlockRef;
}

/** The inputs of a call builder, all as of `block`. */
export interface CallInputs {
  /** `state.block` is the block where the state last changed. */
  readonly state: ContractState;
  readonly ledgerParameters: Uint8Array;
  /** The serialized Zswap chain state, with only the contract's coins in it. */
  readonly zswapChainState: Uint8Array;
  readonly block: BlockRef;
}

// `current()` returns `undefined` before the first value, so a watch cannot use `undefined` for "not found".
export type Lookup<A> = { readonly found: true; readonly value: A } | { readonly found: false };

/** An abort gives `CancelledError`, never this error. */
export class IndexerUnreachableError extends PassportError {
  readonly _tag = 'IndexerUnreachableError';
  readonly code = 'INDEXER_UNREACHABLE';
  readonly reason: 'network' | 'status' | 'response' | 'timeout';

  constructor(reason: 'network' | 'status' | 'response' | 'timeout') {
    super(`The indexer could not be reached (${reason}).`);
    this.name = 'IndexerUnreachableError';
    this.reason = reason;
  }
}

/** A source that cannot be reached gives `IndexerUnreachableError`; it never reads as "not found". */
export interface Indexer {
  /** `undefined` when no contract is at `address`. */
  contractState(
    address: ContractAddress,
    options?: CallOptions,
  ): Promise<ContractState | undefined>;
  /** At the latest block that the source holds. */
  ledgerParameters(options?: CallOptions): Promise<LedgerParametersRead>;
  /** `undefined` when no contract is at `address` at the latest block that the source holds. */
  callInputs(address: ContractAddress, options?: CallOptions): Promise<CallInputs | undefined>;
  /** `undefined` when no block holds the transaction yet. */
  transaction(id: TransactionId, options?: CallOptions): Promise<TransactionStatus | undefined>;
  watchContract(address: ContractAddress): StateSource<Lookup<ContractState>>;
  /** Starts at not found and ends at `final`. The level never goes back; `in-block` may not appear. */
  watchTransaction(id: TransactionId): StateSource<Lookup<TransactionStatus>>;
}
