import type { BlockRef, TransactionId } from './common.js';

export interface UnprovenTransaction {
  readonly stage: 'unproven';
  /** A serialized ledger transaction. Only the adapters read it. */
  readonly bytes: Uint8Array;
}

export interface ProvenTransaction {
  readonly stage: 'proven';
  /** A serialized ledger transaction. Only the adapters read it. */
  readonly bytes: Uint8Array;
}

export interface PaidTransaction {
  readonly stage: 'paid';
  /** A serialized ledger transaction. Only the adapters read it. */
  readonly bytes: Uint8Array;
  readonly id: TransactionId;
  /** Epoch milliseconds. After it, the payment is void: pay again. */
  readonly submitBy: number | undefined;
}

/** `partly-failed` means that the guaranteed part ran and the fallible part failed. */
export type TransactionResult = 'succeeded' | 'partly-failed' | 'failed';

export interface TransactionStatus {
  readonly id: TransactionId;
  readonly level: 'in-block' | 'final';
  readonly block: BlockRef;
  /** `undefined` until the level is `final`. */
  readonly result: TransactionResult | undefined;
}
