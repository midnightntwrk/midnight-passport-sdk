import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as ledger from '@midnightntwrk/ledger-v9';
import { openAccArtifact } from '@midnight-ntwrk/mn-passport-contract';
import {
  canAddCircuits,
  grantSpendCircuits,
  loadRecord,
  openAuthority,
  planAddition,
  planBirth,
  runBirth,
  saveRecord,
  type WavePrice,
} from '@midnight-ntwrk/mn-passport-owner';
import { AuthorityKey } from '../dist/kernel/account-keys.js';
import { ACTIVATION, FakeChain, memoryStore, testRecord, verifierKey } from './fake-chain.js';

const prf = (): Uint8Array => Uint8Array.from({ length: 32 }, (_, i) => i);
const oneEach: WavePrice = (_kind, circuits) => (circuits.length === 1 ? 0.4 : 0.8);
const GRANT = ['withdraw_unshielded_with_grant_jubjub', 'withdraw_shielded_with_grant_jubjub'];

test('the grant-spend set of the pinned build is the three JubJub grant withdrawals', async () => {
  const bytes = await readFile(
    new URL('../../contract/generated/passport-manifest.json', import.meta.url),
  );
  const { manifest } = await openAccArtifact(async () => new Uint8Array(bytes));
  assert.deepEqual([...grantSpendCircuits(manifest)].sort(), [
    'withdraw_shielded_to_contract_with_grant_jubjub',
    'withdraw_shielded_with_grant_jubjub',
    'withdraw_unshielded_with_grant_jubjub',
  ]);
  const plan = planBirth({
    manifest,
    arm: 'p256',
    price: () => 0.01,
    then: grantSpendCircuits(manifest),
  });
  assert.deepEqual(plan.updates.at(-1), grantSpendCircuits(manifest));
});

async function liveAccount(): Promise<{
  chain: FakeChain;
  run: (record: Awaited<ReturnType<typeof loadRecord>>) => ReturnType<typeof runBirth>;
  store: ReturnType<typeof memoryStore>;
  done: Awaited<ReturnType<typeof runBirth>>;
}> {
  const chain = new FakeChain();
  const store = memoryStore();
  const { key: authority, wrapped } = await AuthorityKey.create(ledger, prf());
  const record = testRecord(authority.verifyingKey, Buffer.from(wrapped.wrap).toString('hex'));
  const run = async (r: Awaited<ReturnType<typeof loadRecord>>) => {
    assert.ok(r);
    // A later session opens the key again from the stored wrap.
    const again = await openAuthority(
      ledger,
      { readPrf: async () => ({ first: prf(), userVerified: true }) },
      r,
    );
    return runBirth(r, {
      ledger,
      store,
      sender: chain.sender,
      prover: chain.prover,
      indexer: chain.indexer,
      authority: again,
      booted: () => chain.booted,
      activate: async () => ACTIVATION,
      verifierKey,
      timeoutMs: 5_000,
      sleep: async () => {},
    });
  };
  const done = await run(record);
  return { chain, run, store, done };
}

test('a live account gains new circuits after its birth updates, once each', async () => {
  const { chain, run, store, done } = await liveAccount();
  const state = chain.state?.serialize();
  assert.ok(state);
  const added = planAddition(done, { ledger, state, circuits: GRANT, price: oneEach });
  assert.deepEqual(added.plan.updates.slice(2), [[GRANT[0]], [GRANT[1]]]);
  assert.equal(planAddition(added, { ledger, state, circuits: GRANT, price: oneEach }), added);
  await saveRecord(store, added);

  chain.stopAfter = 'update@2';
  await assert.rejects(run(added));
  chain.stopAfter = undefined;
  chain.earlier = 'lands';
  await run(await loadRecord(store, added.address));
  assert.deepEqual(chain.sent.slice(4), ['update@2', 'update@3']);
  const ops = chain.state?.operations().map(String) ?? [];
  assert.ok(GRANT.every((c) => ops.includes(c)));
});

test('an account with a retired authority cannot plan an addition', async () => {
  const { chain, done } = await liveAccount();
  const retired = new ledger.ContractState();
  retired.maintenanceAuthority = new ledger.ContractMaintenanceAuthority([], 1, 2n);
  assert.ok(chain.state && canAddCircuits(ledger, chain.state.serialize()));
  assert.equal(canAddCircuits(ledger, retired.serialize()), false);
  assert.throws(
    () =>
      planAddition(done, { ledger, state: retired.serialize(), circuits: GRANT, price: oneEach }),
    { code: 'AUTHORITY_RETIRED' },
  );
});
