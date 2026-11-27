import { test } from 'node:test';
import {
  broadcastContract,
  createStubChain,
  createStubFees,
  createStubIndexer,
} from '../packages/dev/dist/index.js';
import { nodeBroadcast } from '../packages/adapter-broadcast/dist/index.js';
import { extrinsicHex } from '../packages/adapter-broadcast/dist/extrinsic.js';
import { fakeNode, hashOf } from '../packages/adapter-broadcast/dist-test/support.js';

// The graph does not let the adapter depend on dev, so the contract runs here.
const cases = broadcastContract(async () => {
  const chain = createStubChain();
  const fees = createStubFees();
  const { node, platform } = fakeNode();
  /** @type {Map<string, import('../packages/core/dist/index.js').PaidTransaction>} */
  const paid = new Map();
  // The fake node puts each block of the stub chain on its own chain.
  node.onSubmit = (hex) => {
    const tx = paid.get(hex);
    if (!tx) return;
    chain.receive(tx);
    const stop = chain.onChange(() => {
      const status = chain.status(tx.id);
      if (!status) return;
      stop();
      node.add(hashOf(status.block.height + 0x1000), [hex]);
    });
  };
  let n = 0;
  const pay = async () => {
    const tx = await fees.pay({ stage: 'proven', bytes: Uint8Array.of(++n, 0xab) });
    paid.set(extrinsicHex(tx.bytes, [0x05, 0x00]), tx);
    return tx;
  };
  return {
    broadcast: nodeBroadcast({
      url: 'https://node.example',
      platform,
      indexer: createStubIndexer(chain),
      pollMs: 1,
    }),
    paid: pay,
    stuck: async () => {
      const tx = await pay();
      chain.hold(tx.id);
      return tx;
    },
    timeoutMs: 2_000,
  };
});

for (const c of cases) test(`node broadcast: ${c.name}`, () => c.run());
