import type { CallOptions } from './common.js';
import type { PaidTransaction, TransactionStatus } from './transaction.js';

export interface SubmitOptions extends CallOptions {
  readonly until: 'in-block' | 'final';
  readonly timeoutMs: number;
}

export interface Broadcast {
  /**
   * A node that already holds `tx` is a success. Rejects with `NodeRefusedError`,
   * or with `TimeoutError` when `until` is not reached in `timeoutMs`.
   */
  submit(tx: PaidTransaction, options: SubmitOptions): Promise<TransactionStatus>;
}
