import type { Fees, ProvenTransaction } from '@midnight-ntwrk/mn-passport-core';
import { check, expectCancel, expectRejection, guarded, type ContractCase } from '../contract.js';

export interface FeesHarness {
  readonly fees: Fees;
  readonly tx: ProvenTransaction;
  /** Makes the next `pay` reject with a sponsor refusal. */
  readonly refuseNext: () => void;
  /** Makes the next call stay in flight until its signal aborts. */
  readonly hold: () => void;
}

export function feesContract(make: () => Promise<FeesHarness>, guardMs = 10_000): ContractCase[] {
  return guarded(
    [
      {
        name: 'pay gives a paid transaction with an id',
        async run() {
          const { fees, tx } = await make();
          const paid = await fees.pay(tx);
          check(paid.stage === 'paid', `got stage ${paid.stage}`);
          check(paid.bytes.length > 0, 'the paid bytes are empty');
          check(/^(?:[0-9a-f]{2})+$/.test(paid.id), `the id is not lowercase hex: ${paid.id}`);
          check(paid.submitBy === undefined || paid.submitBy > Date.now(), 'submitBy has passed');
        },
      },
      {
        name: 'a refusal rejects with an error that names its action',
        async run() {
          const { fees, tx, refuseNext } = await make();
          refuseNext();
          const error = await expectRejection(() => fees.pay(tx));
          // The send loop retries, rebuilds, or stops by this field.
          const action = 'action' in error ? error.action : undefined;
          check(
            action === 'retry' || action === 'rebuild' || action === 'stop',
            `${error._tag} names no action`,
          );
        },
      },
      {
        name: 'an abort before or during pay rejects with CancelledError',
        async run() {
          const { fees, tx, hold } = await make();
          await expectCancel((signal) => fees.pay(tx, { signal }), hold);
        },
      },
    ],
    guardMs,
  );
}
