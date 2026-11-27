import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as ledger from '@midnightntwrk/ledger-v9';
import {
  armsOf,
  MANIFEST_FILE,
  openAccArtifact,
  UnknownBindingError,
  type AccManifest,
  type Identified,
} from '@midnight-ntwrk/mn-passport-contract';
import {
  IndexerUnreachableError,
  type Indexer,
  type LocalStore,
} from '@midnight-ntwrk/mn-passport-core';
import {
  assertNoAccount,
  lookupAccount,
  runBirth,
  saveRecord,
  type AccLookupModule,
  type AccountLedger,
} from '@midnight-ntwrk/mn-passport-owner';
import { lookupWith } from '../dist/account.js';
import { AuthorityKey } from '../dist/kernel/index.js';
import { ACTIVATION, FakeChain, memoryStore, testRecord, verifierKey } from './fake-chain.js';

const PIN_BYTES = new Uint8Array(
  await readFile(new URL('../../contract/generated/passport-manifest.json', import.meta.url)),
);
const readPin = async (path: string): Promise<Uint8Array> => {
  assert.equal(path, MANIFEST_FILE);
  return PIN_BYTES;
};
const pin = await openAccArtifact(readPin);

const KEY_SHA = createHash('sha256')
  .update(await verifierKey())
  .digest('hex');
const keyFile = { size: 0, sha256: KEY_SHA };
const manifest: AccManifest = {
  ...pin.manifest,
  circuits: {
    shared: ['deposit_a', 'recover_a'],
    p256: ['activate_initial_device_with_p256', 'add_device_with_p256'],
    jubjub: [],
    k256: [],
  },
  waveOne: { p256: ['deposit_a', 'activate_initial_device_with_p256'], jubjub: [], k256: [] },
  files: new Map(
    ['deposit_a', 'recover_a', 'activate_initial_device_with_p256', 'add_device_with_p256'].map(
      (c) => [`keys/${c}.verifier`, keyFile],
    ),
  ),
};

// One build: the test manifest. The registry's own tests cover a table of several builds.
const identify = async (onChain: ReadonlyMap<string, string>): Promise<Identified> => ({
  artifact: { ...pin, manifest },
  status: 'current',
  ...armsOf(manifest, onChain),
});

const ALL = ['deposit_a', 'recover_a', 'activate_initial_device_with_p256', 'add_device_with_p256'];

const entryOf = (address: string, counter: bigint): string =>
  createHash('sha256')
    .update(`${address}:${String(counter)}`)
    .digest('hex');

function moduleFor(view: {
  booted: boolean;
  nonce: bigint;
  entries: Set<string>;
}): AccLookupModule {
  return {
    ledger: (): AccountLedger => ({
      booted: view.booted,
      device_epoch: 0n,
      auth_nonce: view.nonce,
      devices: { member: (entry) => view.entries.has(Buffer.from(entry).toString('hex')) },
    }),
    pureCircuits: {
      derive_device_entry_with_p256: (self, _pk, _policy, _epoch, counter) =>
        Buffer.from(entryOf(Buffer.from(self.bytes).toString('hex'), counter), 'hex'),
    },
  };
}

async function onChain(circuits: readonly string[]): Promise<ledger.ContractState> {
  const state = new ledger.ContractState();
  for (const circuit of circuits) {
    const op = new ledger.ContractOperation();
    op.verifierKey = await verifierKey();
    state.setOperation(circuit, op);
  }
  return state;
}

type View = Parameters<typeof moduleFor>[0];
const lookup = (
  store: LocalStore,
  view: View,
  indexer: Indexer = new FakeChain().indexer,
): ReturnType<typeof lookupWith> =>
  lookupWith({ store, indexer, module: moduleFor(view) }, identify);
const NO_VIEW: View = { booted: false, nonce: 0n, entries: new Set() };
const newRecord = () => testRecord(ledger.signatureVerifyingKey(ledger.sampleSigningKey()));

async function setup(): Promise<{
  chain: FakeChain;
  lookup: (view: View, indexer?: Indexer) => ReturnType<typeof lookupWith>;
  store: LocalStore;
  address: string;
}> {
  const chain = new FakeChain();
  const store = memoryStore();
  const record = newRecord();
  await saveRecord(store, record);
  return {
    chain,
    store,
    address: record.address,
    lookup: (view, indexer = chain.indexer) => lookup(store, view, indexer),
  };
}

test('a saved record claims the account, so after a reload it resumes and a second birth is refused', async () => {
  const entries = new Map<string, Uint8Array>();
  const store = memoryStore(entries);
  assert.deepEqual(await lookup(store, NO_VIEW), { state: 'none' });
  await assertNoAccount(store);
  const record = newRecord();
  await saveRecord(store, record);
  await saveRecord(store, record);

  const reloaded = memoryStore(entries);
  await assert.rejects(assertNoAccount(reloaded), { code: 'ACCOUNT_EXISTS' });
  await assert.rejects(saveRecord(reloaded, newRecord()), { code: 'ACCOUNT_EXISTS' });
  const found = await lookup(reloaded, NO_VIEW);
  assert.equal(found.state === 'deploying' && found.record.address, record.address);
});

test('a failed record save leaves no claim, so it blocks no new birth', async () => {
  const store = memoryStore();
  const full: LocalStore = {
    ...store,
    set: (key, value) =>
      key.startsWith('deploy:')
        ? Promise.reject(new Error('the disk is full'))
        : store.set(key, value),
  };
  await assert.rejects(saveRecord(full, newRecord()), /the disk is full/);
  await assertNoAccount(store);
  const next = newRecord();
  await saveRecord(store, next);
  const found = await lookup(store, NO_VIEW);
  assert.equal(found.state === 'deploying' && found.record.address, next.address);
});

test('a birth that stops before its first payment still blocks a second birth', async () => {
  const chain = new FakeChain();
  const store = memoryStore();
  const { key: authority } = await AuthorityKey.create(ledger, new Uint8Array(32).fill(9));
  await assert.rejects(
    runBirth(testRecord(authority.verifyingKey), {
      ...runOptions(chain, store, authority),
      prover: { prove: () => Promise.reject(new Error('the prover is down')) },
    }),
    /the prover is down/,
  );
  await assert.rejects(assertNoAccount(store), { code: 'ACCOUNT_EXISTS' });
});

test('an account that is not on chain, not active, or not complete is still deploying', async () => {
  const { chain, lookup } = await setup();
  const view = { booted: true, nonce: 0n, entries: new Set<string>() };
  assert.equal((await lookup(view)).state, 'deploying');
  chain.state = await onChain(['deposit_a', 'activate_initial_device_with_p256']);
  assert.equal((await lookup(view)).state, 'deploying');
  chain.state = await onChain(ALL);
  assert.equal((await lookup({ ...view, booted: false })).state, 'deploying');
});

test('a complete account is ready with the live use counter of this passkey', async () => {
  const { chain, lookup, address } = await setup();
  chain.state = await onChain(ALL);
  const found = await lookup({ booted: true, nonce: 3n, entries: new Set([entryOf(address, 2n)]) });
  assert.equal(found.state, 'ready');
  assert.equal(found.state === 'ready' && found.useCounter, 2n);
  await assert.rejects(lookup({ booted: true, nonce: 3n, entries: new Set() }), {
    code: 'ACCOUNT_MISMATCH',
  });
});

test('an account of an unknown build, or an unreachable indexer, is an error, never "none"', async () => {
  const { chain, store } = await setup();
  chain.state = await onChain(['deposit_a', 'activate_initial_device_with_p256']);
  const options = {
    store,
    indexer: chain.indexer,
    module: moduleFor(NO_VIEW),
    readFor: () => readPin,
  };
  await assert.rejects(lookupAccount(options), UnknownBindingError);
  const down: Indexer = {
    ...chain.indexer,
    contractState: () => Promise.reject(new IndexerUnreachableError('network')),
  };
  await assert.rejects(lookupAccount({ ...options, indexer: down }), IndexerUnreachableError);
});

test('an account of the pinned build with no p256 circuit holds no passkey device', async () => {
  const { chain, store } = await setup();
  chain.state = await onChain(['deposit_unshielded']);
  await assert.rejects(
    lookupAccount({
      store,
      indexer: chain.indexer,
      module: moduleFor(NO_VIEW),
      readFor: () => readPin,
    }),
    { code: 'ACCOUNT_MISMATCH' },
  );
});

function runOptions(
  chain: FakeChain,
  store: LocalStore,
  authority: AuthorityKey,
): Parameters<typeof runBirth>[1] {
  return {
    ledger,
    store,
    sender: chain.sender,
    prover: chain.prover,
    indexer: chain.indexer,
    authority,
    booted: () => false,
    activate: async () => ACTIVATION,
    verifierKey,
    timeoutMs: 1_000,
    sleep: async () => {},
  };
}

test('a birth run on a device that holds another account sends nothing', async () => {
  const chain = new FakeChain();
  const store = memoryStore();
  await saveRecord(store, newRecord());
  const { key: authority } = await AuthorityKey.create(ledger, new Uint8Array(32).fill(9));
  await assert.rejects(
    runBirth(testRecord(authority.verifyingKey), runOptions(chain, store, authority)),
    {
      code: 'ACCOUNT_EXISTS',
    },
  );
  assert.deepEqual(chain.sent, []);
});
