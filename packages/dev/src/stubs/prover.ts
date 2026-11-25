import type { Prover } from '@midnight-ntwrk/mn-passport-core';
import { createHold } from '../abort.js';

export type StubProver = Prover & {
  /** The next `prove` stays in flight until its signal aborts or its timeout ends. */
  holdNext(): void;
};

/** Returns the unproven bytes as the proven transaction. */
export function createStubProver(): StubProver {
  const hold = createHold();
  return {
    prove: (tx, _circuitIds, options) =>
      hold.run(
        options?.signal,
        () => ({ stage: 'proven', bytes: tx.bytes.slice() }),
        options?.timeoutMs,
      ),
    holdNext: () => hold.next(),
  };
}
