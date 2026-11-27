import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ledger from '@midnightntwrk/ledger-v9';
import { CallFailedError } from '@midnight-ntwrk/mn-passport-core';
import {
  loadRecord,
  runBirth,
  updateTransaction,
  type BirthRecord,
  type DeployProgress,
  type RunOptions,
} from '@midnight-ntwrk/mn-passport-owner';
import { AuthorityKey } from '../dist/kernel/account-keys.js';
import { ACTIVATION, FakeChain, memoryStore, testRecord, verifierKey } from './fake-chain.js';

const prf = (): Uint8Array => Uint8Array.from({ length: 32 }, (_, i) => i);

async function setup(otherSigner = false): Promise<{
  chain: FakeChain;
  record: BirthRecord;
  authority: AuthorityKey;
  options: (over?: Partial<RunOptions>) => RunOptions;
  progress: DeployProgress[];
}> {
  const chain = new FakeChain();
  const { key: authority } = await AuthorityKey.create(ledger, prf());
  const record = testRecord(authority.verifyingKey);
  const store = memoryStore();
  const progress: DeployProgress[] = [];
  const signer = otherSigner ? (await AuthorityKey.create(ledger, prf())).key : authority;
  return {
    chain,
    record,
    authority,
    progress,
    options: (over = {}) => ({
      ledger,
      store,
      sender: chain.sender,
      prover: chain.prover,
      indexer: chain.indexer,
      authority: signer,
      booted: () => chain.booted,
      activate: async () => ACTIVATION,
      verifierKey,
      timeoutMs: 5_000,
      sleep: async () => {},
      onProgress: (p) => progress.push(p),
      ...over,
    }),
  };
}

test('a birth sends wave 1, the activation, and each update once, in counter order', async () => {
  const { chain, record, options, progress } = await setup();
  const done = await runBirth(record, options());
  assert.deepEqual(chain.sent, ['deploy', 'activation', 'update@0', 'update@1']);
  assert.equal(chain.state?.maintenanceAuthority.counter, 2n);
  assert.equal(done.salt, undefined);
  assert.equal(done.inFlight, undefined);
  assert.deepEqual(
    progress.map((p) => p.kind),
    ['planned', 'wave', 'activated', 'wave', 'wave', 'done'],
  );
});

test('a run stopped after wave 1 resumes without a second deploy', async () => {
  const { chain, record, options } = await setup();
  chain.stopAfter = 'deploy';
  const opts = options();
  await assert.rejects(runBirth(record, opts));
  chain.stopAfter = undefined;
  const stored = await loadRecord(opts.store, record.address);
  assert.ok(stored?.inFlight, 'the paid deploy is in the record before the stop');
  chain.earlier = 'lands';
  await runBirth(stored, opts);
  assert.deepEqual(chain.sent, ['deploy', 'activation', 'update@0', 'update@1']);
});

test('a wave in flight at a stop is paid again only after its TTL wait ends', async () => {
  const { chain, record, options } = await setup();
  const inFlight = { ...record, inFlight: { id: 'old', notAfter: Date.now() + 60_000 } };

  chain.earlier = 'lands';
  const tx = ledger.Transaction.deserialize(
    'signature',
    'pre-proof',
    'pre-binding',
    Buffer.from(record.deploy, 'hex'),
  );
  const deploy = [...(tx.intents?.values() ?? [])].flatMap((i) => i.actions)[0];
  assert.ok(deploy instanceof ledger.ContractDeploy);
  chain.pendingDeploy = deploy;
  await runBirth(inFlight, options());
  assert.equal(chain.finals, 1);
  assert.equal(chain.sent[0], 'activation', 'the old payment landed, so no new deploy');

  const lost = await setup();
  lost.chain.earlier = 'lost';
  const soon = { id: 'old', notAfter: Date.now() + 20 };
  await runBirth({ ...lost.record, inFlight: soon }, lost.options());
  assert.equal(lost.chain.finals, 1);
  assert.equal(lost.chain.sent[0], 'deploy');
});

test('an activation that lands without success stops the run before any update', async () => {
  const { chain, record, options } = await setup();
  chain.activationResult = 'partly-failed';
  await assert.rejects(
    runBirth(record, options()),
    (e) => e instanceof CallFailedError && e.status.result === 'partly-failed',
  );
  assert.deepEqual(chain.sent, ['deploy', 'activation']);
});

test("another account's authority key is refused before anything is paid", async () => {
  const { chain, record, options } = await setup(true);
  await assert.rejects(runBirth(record, options()), { code: 'AUTHORITY_KEY_MISMATCH' });
  assert.deepEqual(chain.sent, []);
});

test('a resumed run skips the updates that the chain already has', async () => {
  const { chain, record, options } = await setup();
  chain.stopAfter = 'update@0';
  const opts = options();
  await assert.rejects(runBirth(record, opts));
  chain.stopAfter = undefined;
  chain.earlier = 'lands';
  const stored = await loadRecord(opts.store, record.address);
  assert.ok(stored);
  await runBirth(stored, opts);
  assert.deepEqual(chain.sent, ['deploy', 'activation', 'update@0', 'update@1']);
});

test('a wave that the node refuses is built and paid again, and its old bytes are not resent', async () => {
  const { chain, record, options } = await setup();
  chain.refuseOnce = 'update@0';
  const done = await runBirth(record, options());
  assert.deepEqual(chain.sent, ['deploy', 'activation', 'update@0', 'update@1']);
  const [refused, landed, ...more] = chain.submits.filter((s) => s.kind === 'update@0');
  assert.ok(refused && landed && more.length === 0);
  assert.notEqual(landed.id, refused.id);
  assert.notDeepEqual(landed.bytes, refused.bytes);
  assert.equal(done.inFlight, undefined);
});

test('a failed record write for a rebuilt wave fails the run', async () => {
  const { chain, record, options } = await setup();
  chain.refuseOnce = 'deploy';
  const opts = options();
  let writes = 0;
  const store: RunOptions['store'] = {
    ...opts.store,
    set: async (key, value) => {
      if (key.includes(record.address) && ++writes === 1) throw new Error('the disk is full');
      await opts.store.set(key, value);
    },
  };
  await assert.rejects(runBirth(record, { ...opts, store }), /the disk is full/);
});

test('an update outside the plan does not make the run skip a planned update', async () => {
  const { chain, record, authority, options } = await setup();
  chain.stopAfter = 'activation';
  const opts = options();
  await assert.rejects(runBirth(record, opts));
  chain.stopAfter = undefined;
  chain.earlier = 'lands';
  const outside = { ...record, plan: { ...record.plan, updates: [['outside_circuit']] } };
  chain.landOutside(
    await updateTransaction(ledger, outside, authority, 0, 0n, verifierKey, 60_000),
  );
  const stored = await loadRecord(opts.store, record.address);
  assert.ok(stored);
  await runBirth(stored, opts);
  const ops = chain.state?.operations().map(String) ?? [];
  for (const circuit of record.plan.updates.flat()) assert.ok(ops.includes(circuit), circuit);
});
