import type {
  ContractAddress,
  ContractState,
  PaidTransaction,
  TransactionId,
  TransactionStatus,
} from '@midnight-ntwrk/mn-passport-core';

/** An in-memory chain. A received transaction is in a block after a microtask, and final after a timer. */
export interface StubChain {
  /** Call before `receive`. The transaction with `id` then gets into no block. */
  hold(id: TransactionId): void;
  /** A second receipt of the same id changes nothing. */
  receive(tx: PaidTransaction): void;
  status(id: TransactionId): TransactionStatus | undefined;
  /** Sets the status of `status.id`, so a test can script any level, block, or result. */
  setStatus(status: TransactionStatus): void;
  /** Puts `bytes` at `address` in a new block. */
  setContract(address: ContractAddress, bytes: Uint8Array): void;
  contract(address: ContractAddress): ContractState | undefined;
  onChange(listener: () => void): () => void;
}

export function createStubChain(): StubChain {
  const held = new Set<TransactionId>();
  const received = new Set<TransactionId>();
  const statuses = new Map<TransactionId, TransactionStatus>();
  const contracts = new Map<ContractAddress, ContractState>();
  const listeners = new Set<() => void>();
  let height = 0;
  const nextBlock = () => {
    height++;
    return { height, hash: height.toString(16).padStart(64, '0') };
  };

  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };

  return {
    hold: (id) => void held.add(id),
    receive(tx) {
      if (received.has(tx.id)) return;
      received.add(tx.id);
      if (held.has(tx.id)) return;
      void Promise.resolve().then(() => {
        const block = nextBlock();
        statuses.set(tx.id, { id: tx.id, level: 'in-block', block, result: undefined });
        notify();
        setTimeout(() => {
          statuses.set(tx.id, { id: tx.id, level: 'final', block, result: 'succeeded' });
          notify();
        }, 0);
      });
    },
    status: (id) => statuses.get(id),
    setStatus(status) {
      statuses.set(status.id, status);
      notify();
    },
    setContract(address, bytes) {
      contracts.set(address, { address, bytes: bytes.slice(), block: nextBlock() });
      notify();
    },
    contract: (address) => contracts.get(address),
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
