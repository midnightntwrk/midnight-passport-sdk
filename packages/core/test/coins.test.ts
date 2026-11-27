import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CoinStoreFormatError,
  createCoinStore,
  loadCoinStore,
  saveCoinStore,
  type LocalStore,
} from '@midnight-ntwrk/mn-passport-core';

const color = new Uint8Array(32).fill(9);
const other = new Uint8Array(32).fill(8);
const coin = (n: number, value: bigint, c = color) => ({
  nonce: new Uint8Array(32).fill(n),
  color: c,
  value,
});
const candidate = (n: number, value: bigint, inboxIndex = 0n) => ({
  ...coin(n, value),
  inboxIndex,
});

// `core` tests cannot import `dev`, because `dev` depends on `core`.
const memoryStore = (): LocalStore & { readonly entries: Map<string, Uint8Array> } => {
  const entries = new Map<string, Uint8Array>();
  return {
    entries,
    get: (k) => Promise.resolve(entries.get(k)),
    set: (k, v) => Promise.resolve(void entries.set(k, v)),
    delete: (k) => Promise.resolve(void entries.delete(k)),
    keys: () => Promise.resolve([...entries.keys()]),
    wipe: () => Promise.resolve(entries.clear()),
  };
};

test('two coins of one color are both held and selectable; a candidate never counts', () => {
  const store = createCoinStore();
  store.offer(candidate(1, 50n));
  store.offer(candidate(2, 80n));
  store.offer(candidate(3, 1000n));
  store.hold(coin(1, 50n), 4n);
  store.hold(coin(2, 80n), 5n);
  store.hold(coin(4, 70n, other), 6n);
  assert.equal(store.total(color), 130n);
  assert.deepEqual(store.select(color, 60n), { ...coin(2, 80n), mtIndex: 5n });
  assert.equal(store.select(color, 10n)?.mtIndex, 4n);
  assert.equal(store.select(color, 500n), undefined, 'the 1000 coin is only a candidate');
});

test('a spent coin stays spent when the walk offers it again, also after a reload', () => {
  const store = createCoinStore();
  store.offer(candidate(1, 50n, 3n));
  store.hold(coin(1, 50n), 4n);
  store.markSpent(coin(1, 50n));
  store.offer(candidate(1, 50n, 3n));
  store.hold(coin(1, 50n), 4n);
  const again = createCoinStore(store.serialize());
  again.offer(candidate(1, 50n, 3n));
  again.hold(coin(1, 50n), 4n);
  assert.equal(again.total(color), 0n);
  assert.deepEqual(again.coins(), [
    { ...coin(1, 50n), state: 'spent', mtIndex: 4n, inboxIndex: 3n },
  ]);
});

test('a new tree position corrects the coin, and does not add a second one', () => {
  const store = createCoinStore();
  store.hold(coin(1, 50n), 4n);
  store.hold(coin(1, 50n), 9n);
  assert.equal(store.coins().length, 1);
  assert.equal(store.select(color, 1n)?.mtIndex, 9n);
});

test('a bad coin or index is refused before it reaches the store', () => {
  const store = createCoinStore();
  assert.throws(() => store.hold(coin(1, 50n), 1n << 64n), RangeError);
  assert.throws(() => store.hold({ ...coin(1, 50n), nonce: new Uint8Array(31) }, 0n), RangeError);
  assert.throws(() => store.offer(candidate(1, 1n << 128n)), RangeError);
  assert.deepEqual(store.coins(), []);
});

test('the store round-trips, and a damaged or unknown store is a typed error', () => {
  const store = createCoinStore();
  store.offer(candidate(1, 50n, 2n));
  store.hold(coin(2, (1n << 128n) - 1n), (1n << 64n) - 1n);
  store.markSpent(coin(3, 7n));
  assert.deepEqual(createCoinStore(store.serialize()).coins(), store.coins());

  const text = (t: string) => new TextEncoder().encode(t);
  const row = (fields: object) =>
    text(
      JSON.stringify({
        version: 1,
        coins: [{ nonce: '11'.repeat(32), color: '22'.repeat(32), value: '5', ...fields }],
      }),
    );
  const reason = (bytes: Uint8Array): string => {
    try {
      createCoinStore(bytes);
    } catch (e) {
      assert.ok(e instanceof CoinStoreFormatError);
      return e.reason;
    }
    return 'accepted';
  };
  assert.equal(reason(text('{"version":2,"coins":[]}')), 'version');
  const damaged = [
    text('not json'),
    new Uint8Array([0x7b, 0xff, 0x7d]),
    text('{"coins":[]}'),
    row({ state: 'held' }),
    row({ state: 'candidate' }),
    row({ state: 'lost' }),
    row({ state: 'held', mtIndex: '01' }),
    row({ state: 'candidate', inboxIndex: '0', value: String(1n << 128n) }),
    row({ state: 'candidate', inboxIndex: '0', nonce: 'AB'.repeat(32) }),
    text(
      JSON.stringify({
        version: 1,
        coins: [0, 1].map(() => ({
          nonce: '11'.repeat(32),
          color: '22'.repeat(32),
          value: '5',
          state: 'candidate',
          inboxIndex: '0',
        })),
      }),
    ),
  ];
  for (const bytes of damaged) assert.equal(reason(bytes), 'malformed');
});

test('the saved store is kept per network and address, and loads back', async () => {
  const local = memoryStore();
  const address = 'ab'.repeat(32);
  assert.deepEqual((await loadCoinStore(local, { network: 'preview', address })).coins(), []);
  const store = createCoinStore();
  store.hold(coin(1, 50n), 4n);
  await saveCoinStore(local, { network: 'preview', address }, store);
  const back = await loadCoinStore(local, { network: 'preview', address });
  assert.equal(back.total(color), 50n);
  assert.deepEqual((await loadCoinStore(local, { network: 'mainnet', address })).coins(), []);
});

test('a store key that the platform would refuse is a RangeError before any store call', async () => {
  const local = memoryStore();
  const store = createCoinStore();
  const long = { network: 'n'.repeat(50), address: 'ab'.repeat(32) };
  await assert.rejects(saveCoinStore(local, long, store), RangeError);
  await assert.rejects(loadCoinStore(local, { network: 'preview', address: 'AB' }), RangeError);
  // A `:` in the network name could make two scopes share one key.
  await assert.rejects(loadCoinStore(local, { network: 'a:b', address: 'cd' }), RangeError);
  assert.equal(local.entries.size, 0);
});
