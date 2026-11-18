import type { AbortSignalLike, Broadcast, PaidTransaction } from '@midnight-ntwrk/mn-passport-core';
import { check, expectCancel, expectRejection, guarded, type ContractCase } from '../contract.js';

export interface BroadcastHarness {
  readonly broadcast: Broadcast;
  /** A new paid transaction that the chain accepts. */
  readonly paid: () => Promise<PaidTransaction>;
  /** A paid transaction that gets into no block. */
  readonly stuck: () => Promise<PaidTransaction>;
  /** Bounds each wait. It must cover a block and finality on the chain under test. */
  readonly timeoutMs: number;
}

export function broadcastContract(
  make: () => Promise<BroadcastHarness>,
  guardMs = 10_000,
): ContractCase[] {
  return guarded(
    [
      {
        name: 'submit until final gives a final status after in-block, and a second submit is a success',
        async run() {
          const { broadcast, paid, timeoutMs } = await make();
          const tx = await paid();
          const inBlock = await broadcast.submit(tx, { until: 'in-block', timeoutMs });
          check(inBlock.id === tx.id, `got the status of ${inBlock.id}`);
          check(inBlock.level === 'in-block', `got level ${inBlock.level}`);
          const status = await broadcast.submit(tx, { until: 'final', timeoutMs });
          check(status.level === 'final', `got level ${status.level}`);
          check(status.result !== undefined, 'a final status has no result');
        },
      },
      {
        name: 'no block within timeoutMs rejects with TimeoutError',
        async run() {
          const { broadcast, stuck } = await make();
          const tx = await stuck();
          const error = await expectRejection(
            () => broadcast.submit(tx, { until: 'in-block', timeoutMs: 20 }),
            'TimeoutError',
          );
          const afterMs = 'afterMs' in error ? error.afterMs : undefined;
          check(afterMs === 20, `the timeout came after ${String(afterMs)} ms, not 20 ms`);
        },
      },
      {
        name: 'an abort before or during submit rejects with CancelledError',
        async run() {
          const { broadcast, stuck, timeoutMs } = await make();
          // A stuck transaction keeps the call in flight until the abort.
          const tx = await stuck();
          const submit = (signal: AbortSignalLike) =>
            broadcast.submit(tx, { until: 'final', timeoutMs, signal });
          await expectCancel(submit, () => {});
        },
      },
    ],
    guardMs,
  );
}
