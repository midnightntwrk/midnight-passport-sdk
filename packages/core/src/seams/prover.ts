import type { CallOptions } from './common.js';
import type { ProvenTransaction, UnprovenTransaction } from './transaction.js';

export interface ProveOptions extends CallOptions {
  /** After it, the call rejects with `TimeoutError`. */
  readonly timeoutMs?: number;
}

/** The prover holds the proving keys. It sees the private inputs of `tx`. */
export interface Prover {
  /** `circuitIds` are the circuit names in the contract artifact. */
  prove(
    tx: UnprovenTransaction,
    circuitIds: readonly string[],
    options?: ProveOptions,
  ): Promise<ProvenTransaction>;
}
