import type { Prover, UnprovenTransaction } from '@midnight-ntwrk/mn-passport-core';
import { check, expectCancel, expectRejection, guarded, type ContractCase } from '../contract.js';

export interface ProverHarness {
  readonly prover: Prover;
  readonly tx: UnprovenTransaction;
  readonly circuitIds: readonly string[];
  /** Makes the next call stay in flight until its signal aborts or its timeout ends. */
  readonly hold: () => void;
}

export function proverContract(
  make: () => Promise<ProverHarness>,
  guardMs = 10_000,
): ContractCase[] {
  return guarded(
    [
      {
        name: 'prove gives a proven transaction',
        async run() {
          const { prover, tx, circuitIds } = await make();
          const proven = await prover.prove(tx, circuitIds);
          check(proven.stage === 'proven', `got stage ${proven.stage}`);
          check(proven.bytes.length > 0, 'the proven bytes are empty');
        },
      },
      {
        name: 'an abort before or during prove rejects with CancelledError',
        async run() {
          const { prover, tx, circuitIds, hold } = await make();
          await expectCancel((signal) => prover.prove(tx, circuitIds, { signal }), hold);
        },
      },
      {
        name: 'no proof within timeoutMs rejects with TimeoutError',
        async run() {
          const { prover, tx, circuitIds, hold } = await make();
          hold();
          const prove = () => prover.prove(tx, circuitIds, { timeoutMs: 20 });
          const error = await expectRejection(prove, 'TimeoutError');
          const afterMs = 'afterMs' in error ? error.afterMs : undefined;
          check(afterMs === 20, `the timeout came after ${String(afterMs)} ms, not 20 ms`);
        },
      },
    ],
    guardMs,
  );
}
