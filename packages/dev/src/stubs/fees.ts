import type { Fees, PassportError } from '@midnight-ntwrk/mn-passport-core';
import { createHold } from '../abort.js';

export type StubFees = Fees & {
  /** The next `pay` rejects with `error`. */
  refuseNext(error: PassportError): void;
  /** The next `pay` stays in flight until its signal aborts. */
  holdNext(): void;
};

/** Each payment gets a new id. The paid bytes are the proven bytes. */
export function createStubFees(): StubFees {
  let payments = 0;
  let refusal: PassportError | undefined;
  const hold = createHold();
  return {
    pay: (tx, options) =>
      hold.run(options?.signal, () => {
        const error = refusal;
        refusal = undefined;
        if (error) throw error;
        payments++;
        const id = payments.toString(16).padStart(64, '0');
        return { stage: 'paid', bytes: tx.bytes.slice(), id, submitBy: undefined };
      }),
    refuseNext(error) {
      refusal = error;
    },
    holdNext: () => hold.next(),
  };
}
