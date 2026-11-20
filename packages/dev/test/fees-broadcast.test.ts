import {
  PassportError,
  UpstreamError,
  type Broadcast,
  type Fees,
} from '@midnight-ntwrk/mn-passport-core';
import {
  broadcastContract,
  createStubBroadcast,
  createStubChain,
  createStubFees,
  feesContract,
  type BroadcastHarness,
  type FeesHarness,
} from '@midnight-ntwrk/mn-passport-dev';
import { expectFailing, guardMs, run } from './run.js';

const tx = { stage: 'proven', bytes: new Uint8Array([1, 2, 3]) } as const;
const refusal = () => new UpstreamError({ sourceTag: 'Test' });

// A sponsor refusal as the fees seam states it. The contract reads only its `action`.
class BusyError extends PassportError {
  readonly _tag = 'BusyError';
  readonly code = 'BUSY';
  readonly action = 'retry';
}

const feesHarness = (
  wrap: (f: Fees) => Fees = (f) => f,
  refuse: () => PassportError = () => new BusyError(),
): FeesHarness => {
  const stub = createStubFees();
  return {
    fees: wrap(stub),
    tx,
    refuseNext: () => stub.refuseNext(refuse()),
    hold: () => stub.holdNext(),
  };
};
run(
  'stub fees',
  feesContract(async () => feesHarness()),
);

const harness = (wrap: (b: Broadcast) => Broadcast = (b) => b): BroadcastHarness => {
  const chain = createStubChain();
  const fees = createStubFees();
  return {
    broadcast: wrap(createStubBroadcast(chain)),
    paid: () => fees.pay(tx),
    async stuck() {
      const paid = await fees.pay(tx);
      chain.hold(paid.id);
      return paid;
    },
    timeoutMs: 1_000,
  };
};
run(
  'stub broadcast',
  broadcastContract(async () => harness()),
);

const deafFees = (f: Fees): Fees => ({ pay: (t) => f.pay(t) });
expectFailing(
  'the fees contract fails a sponsor that ignores the signal',
  feesContract(async () => feesHarness(deafFees), guardMs),
  [
    [
      'an abort before or during pay rejects with CancelledError',
      'expected a rejection with CancelledError, got a result',
    ],
  ],
);

expectFailing(
  'the fees contract fails a refusal with no action',
  feesContract(async () => feesHarness(undefined, refusal)),
  [['a refusal rejects with an error that names its action', 'UpstreamError names no action']],
);

// Above the 20 ms asked and below the guard, so only the timeout check can fail it.
const ownDeadline = (b: Broadcast): Broadcast => ({
  submit: (paid, options) => b.submit(paid, { ...options, timeoutMs: 100 }),
});
expectFailing(
  'the broadcast contract fails a broadcast that ignores timeoutMs',
  broadcastContract(async () => harness(ownDeadline), guardMs),
  [['no block within timeoutMs rejects with TimeoutError', 'after 100 ms, not 20 ms']],
);

const once = (b: Broadcast): Broadcast => {
  const seen = new Set<string>();
  return {
    async submit(paid, options) {
      if (seen.has(paid.id)) throw refusal();
      const status = await b.submit(paid, options);
      seen.add(paid.id);
      return status;
    },
  };
};
expectFailing(
  'the broadcast contract fails a broadcast that refuses a second submit',
  broadcastContract(async () => harness(once)),
  [
    [
      'submit until final gives a final status after in-block, and a second submit is a success',
      'An upstream call failed',
    ],
  ],
);
