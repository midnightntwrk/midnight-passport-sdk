import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PaidTransaction, TransactionStatus } from '@midnight-ntwrk/mn-passport-core';
import { nodeBroadcast } from '@midnight-ntwrk/mn-passport-adapter-broadcast';
import { createStubChain, createStubIndexer } from '@midnight-ntwrk/mn-passport-dev';
import { extrinsicHex } from '../dist/extrinsic.js';
import { fakeNode, hashOf, paymentId, provenTx, sponsorPays } from './support.js';

const tx: PaidTransaction = {
  stage: 'paid',
  bytes: Uint8Array.of(7, 7),
  id: 'ab'.repeat(33),
  submitBy: undefined,
};
const HEX = extrinsicHex(tx.bytes, [0x05, 0x00]);

function setup(expiryMarginMs?: number) {
  const { node, platform } = fakeNode();
  const chain = createStubChain();
  const indexer = createStubIndexer(chain);
  const broadcast = nodeBroadcast({
    url: 'https://node.example',
    platform,
    indexer,
    pollMs: 2,
    ...(expiryMarginMs === undefined ? {} : { expiryMarginMs }),
  });
  return {
    node,
    platform,
    broadcast,
    setFinal: (status: TransactionStatus) => chain.setStatus(status),
    failIndexer: (count: number) => indexer.failReads(count),
  };
}

const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));
const FINAL: TransactionStatus = {
  id: tx.id,
  level: 'final',
  block: { height: 2, hash: 'cd'.repeat(32) },
  result: 'partly-failed',
};

test('in-block resolves from the node, with no result, and does not wait for final', async () => {
  const { node, broadcast } = setup();
  const done = broadcast.submit(tx, { until: 'in-block', timeoutMs: 1_000 });
  await tick();
  node.add(hashOf(1));
  await tick();
  node.add(hashOf(2), ['0x00', HEX]);
  assert.deepEqual(await done, {
    id: tx.id,
    level: 'in-block',
    block: { height: 2, hash: hashOf(2).slice(2) },
    result: undefined,
  });
});

test('final comes from the indexer, with its result', async () => {
  const { node, broadcast, setFinal } = setup();
  node.add(hashOf(1), [HEX]);
  const done = broadcast.submit(tx, { until: 'final', timeoutMs: 1_000 });
  await tick();
  setFinal(FINAL);
  assert.deepEqual(await done, FINAL);
});

test('the walk reads a block that replaced one it read before', async () => {
  const { node, broadcast } = setup();
  const done = broadcast.submit(tx, { until: 'in-block', timeoutMs: 1_000 });
  await tick();
  node.add(hashOf(0xa1));
  await tick();
  node.add(hashOf(0xb1), [HEX], hashOf(0));
  assert.equal((await done).block.hash, hashOf(0xb1).slice(2));
});

test('dropped calls are retried until the deadline, and never hang', async () => {
  const { node, broadcast } = setup();
  node.drops = { chain_getHeader: 2, author_submitExtrinsic: 2 };
  node.add(hashOf(1));
  const done = broadcast.submit(tx, { until: 'in-block', timeoutMs: 1_000 });
  await tick(30);
  node.add(hashOf(2), [HEX]);
  assert.equal((await done).block.height, 2);
  assert.equal(node.submitTimes.length, 3);

  // A request that hangs ends at the deadline, before its own 10 s bound.
  const hung = setup();
  hung.platform.answer(() => new Promise(() => {}));
  const wait = hung.broadcast.submit(tx, { until: 'in-block', timeoutMs: 30 });
  await assert.rejects(wait, /No result after 30 ms/);

  const down = setup();
  down.node.drops = { '*': Number.POSITIVE_INFINITY };
  const started = Date.now();
  await assert.rejects(
    down.broadcast.submit(tx, { until: 'in-block', timeoutMs: 50 }),
    (e: Error & { _tag?: string; afterMs?: number }) =>
      e._tag === 'TimeoutError' && e.afterMs === 50,
  );
  assert.ok(Date.now() - started < 500);
});

test('a refusal throws, unless a block or the indexer already holds the transaction', async () => {
  const refusal = { code: 1010, message: 'Invalid Transaction', data: 'Custom error: 170' };
  const refused = setup();
  refused.node.refusal = refusal;
  await assert.rejects(
    refused.broadcast.submit(tx, { until: 'in-block', timeoutMs: 1_000 }),
    (e: Error & { _tag?: string; nodeCode?: number }) =>
      e._tag === 'NodeRefusedError' && e.nodeCode === 170,
  );

  // An indexer error is "check again", never "not there".
  const indexed = setup();
  indexed.node.refusal = refusal;
  indexed.setFinal(FINAL);
  indexed.failIndexer(2);
  const found = await indexed.broadcast.submit(tx, { until: 'in-block', timeoutMs: 1_000 });
  assert.deepEqual(found.block, FINAL.block);
  assert.equal(indexed.node.submitTimes.length, 1);

  // A 1012 for bytes that a block holds; a failed block read is "check again" too.
  const flaky = setup();
  flaky.node.add(hashOf(1), [HEX]);
  flaky.node.add(hashOf(2));
  flaky.node.refusal = { code: 1012, message: 'Transaction is temporarily banned' };
  flaky.node.drops = { chain_getBlockHash: 3 };
  const late = await flaky.broadcast.submit(tx, { until: 'in-block', timeoutMs: 1_000 });
  assert.equal(late.block.height, 1);
});

test('after a timeout, the same bytes wait, and another payment with the same id is sent', async () => {
  const { node, broadcast } = setup();
  const second = { ...tx, bytes: Uint8Array.of(8, 8) };
  await assert.rejects(broadcast.submit(tx, { until: 'in-block', timeoutMs: 20 }));
  node.add(hashOf(1), [HEX, extrinsicHex(second.bytes, [0x05, 0x00])]);
  const again = (paid: PaidTransaction) =>
    broadcast.submit(paid, { until: 'in-block', timeoutMs: 1_000 });
  assert.equal((await again(tx)).block.height, 1);
  assert.equal((await again(second)).block.height, 1);
  assert.equal(node.submitTimes.length, 2);
});

test('an abort during the wait rejects with CancelledError and stops the polls', async () => {
  const { platform, broadcast } = setup();
  const controller = new AbortController();
  const done = broadcast.submit(tx, {
    until: 'in-block',
    timeoutMs: 1_000,
    signal: controller.signal,
  });
  await tick();
  controller.abort();
  await assert.rejects(done, (e: Error & { _tag?: string }) => e._tag === 'CancelledError');
  const count = platform.requests.length;
  await tick();
  assert.equal(platform.requests.length, count);
});

test('the factory refuses a bad URL, call index, or duration', () => {
  const { platform } = fakeNode();
  const indexer = createStubIndexer(createStubChain());
  const base = { url: 'https://node.example', platform, indexer };
  assert.throws(() => nodeBroadcast({ ...base, url: 'http://node.example' }), TypeError);
  assert.throws(() => nodeBroadcast({ ...base, callIndex: [0x105, 0] }), RangeError);
  assert.throws(() => nodeBroadcast({ ...base, callIndex: [1.5, 0] }), RangeError);
  const short = [5] as unknown as [number, number];
  assert.throws(() => nodeBroadcast({ ...base, callIndex: short }), RangeError);
  assert.throws(() => nodeBroadcast({ ...base, pollMs: -1 }), RangeError);
});

/** A real payment whose fee intent expires 30 ms after it is made. */
async function shortPayment() {
  const proven = await provenTx({ deploy: true });
  const bytes = await sponsorPays(proven.bytes, 30);
  const id = paymentId(bytes, proven.bytes);
  assert.ok(id !== undefined);
  return { proven, paid: { stage: 'paid' as const, bytes, id, submitBy: undefined } };
}

test('bytes never go to the node after submitBy', async (t) => {
  // Only Date is mocked, so the polls and the call bound run on real timers.
  t.mock.timers.enable({ apis: ['Date'] });
  const submitBy = 100;
  const soon = { ...tx, submitBy };
  const pass = (): void => t.mock.timers.setTime(submitBy);
  const at = (
    platform: ReturnType<typeof setup>['platform'],
    method: string,
    nth: number,
    run: () => void,
  ) => {
    const http = platform.http.bind(platform);
    let seen = 0;
    platform.http = (request) => {
      if (String(request.body).includes(method) && ++seen === nth) run();
      return http(request);
    };
  };
  const fresh = () => {
    t.mock.timers.setTime(0);
    return setup();
  };

  const down = fresh();
  down.node.drops = { '*': Number.POSITIVE_INFINITY };
  at(down.platform, 'chain_getHeader', 2, pass);
  await assert.rejects(
    down.broadcast.submit(soon, { until: 'in-block', timeoutMs: 1_000 }),
    (e: Error & { _tag?: string; sent?: boolean }) => e._tag === 'PaymentExpiredError' && !e.sent,
  );
  assert.equal(down.node.submitTimes.length, 0);

  // The clock passes submitBy while the adapter waits for the best height.
  const slow = fresh();
  at(slow.platform, 'chain_getHeader', 1, pass);
  await assert.rejects(
    slow.broadcast.submit(soon, { until: 'in-block', timeoutMs: 1_000 }),
    (e: Error & { _tag?: string }) => e._tag === 'PaymentExpiredError',
  );
  assert.equal(slow.node.submitTimes.length, 0);

  const flaky = fresh();
  const controller = new AbortController();
  flaky.node.drops = { author_submitExtrinsic: Number.POSITIVE_INFINITY };
  at(flaky.platform, 'author_submitExtrinsic', 3, pass);
  // The adapter reads blocks only when it counts the bytes as sent, so it has stopped sending.
  at(flaky.platform, 'chain_getBlockHash', 2, () => controller.abort());
  // A failed send may have reached the node, so it is never called unsent.
  await assert.rejects(
    flaky.broadcast.submit(soon, {
      until: 'in-block',
      timeoutMs: 1_000,
      signal: controller.signal,
    }),
    (e: Error & { _tag?: string }) => e._tag === 'CancelledError',
  );
  assert.equal(flaky.node.submitTimes.length, 3);

  const late = setup();
  await assert.rejects(
    late.broadcast.submit(
      { ...tx, submitBy: Date.now() - 1 },
      { until: 'in-block', timeoutMs: 1_000 },
    ),
    (e: Error & { _tag?: string }) => e._tag === 'PaymentExpiredError',
  );
  assert.equal(late.node.submitTimes.length, 0);
});

test('a sent payment past its earliest ttl, in no block and not indexed, has expired', async () => {
  const { paid } = await shortPayment();
  const { node, broadcast } = setup(10);
  await assert.rejects(
    broadcast.submit(paid, { until: 'in-block', timeoutMs: 2_000 }),
    (e: Error & { _tag?: string; sent?: boolean }) =>
      e._tag === 'PaymentExpiredError' && e.sent === true,
  );
  assert.equal(node.submitTimes.length, 1);
});

test('a sibling payment of the same proof is found by the proof identifier, and waited on to final', async () => {
  const { proven, paid } = await shortPayment();
  const [proofId] = (await import('@midnightntwrk/ledger-v9')).Transaction.deserialize(
    'signature',
    'proof',
    'pre-binding',
    proven.bytes,
  ).identifiers();
  assert.ok(proofId !== undefined);
  const { broadcast, setFinal } = setup(10);
  setFinal({ ...FINAL, id: proofId, level: 'in-block', result: undefined });
  const waiting = broadcast.submit(paid, { until: 'final', timeoutMs: 2_000 });
  setTimeout(() => setFinal({ ...FINAL, id: proofId }), 50);
  assert.deepEqual(await waiting, { ...FINAL, id: proofId });
  const found = await broadcast.submit(paid, { until: 'in-block', timeoutMs: 2_000 });
  assert.deepEqual(found.block, FINAL.block);
  assert.equal(found.id, proofId);
  // A kept payment watches the sibling at once.
  assert.equal((await broadcast.submit(paid, { until: 'final', timeoutMs: 200 })).id, proofId);
});

test('no payment counts as expired inside the margin', async () => {
  const { paid } = await shortPayment();
  const { broadcast } = setup(5_000);
  await assert.rejects(
    broadcast.submit(paid, { until: 'in-block', timeoutMs: 200 }),
    (e: Error & { _tag?: string }) => e._tag === 'TimeoutError',
  );
});

test('a send that ended in flight is not called unsent after submitBy', async () => {
  const { node, platform, broadcast } = setup();
  const http = platform.http.bind(platform);
  platform.http = (request) =>
    String(request.body).includes('author_submitExtrinsic') ? new Promise(() => {}) : http(request);
  const paid = { ...tx, submitBy: Date.now() + 40 };
  await assert.rejects(broadcast.submit(paid, { until: 'in-block', timeoutMs: 20 }), /No result/);
  await tick(30);
  node.add(hashOf(1), [HEX]);
  assert.equal(
    (await broadcast.submit(paid, { until: 'in-block', timeoutMs: 1_000 })).block.height,
    1,
  );
});
