import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
} from 'node:crypto';
import {
  deriveInboxKey,
  InboxKeyError,
  InboxRecipientKeyError,
  openInboxEntry,
  sealInboxEntry,
  type InboxKey,
} from '@midnight-ntwrk/mn-passport-core';

interface Vector {
  secretKey: string;
  coin: { nonce: string; color: string; value: string };
  entry: string;
}
const strings = (value: unknown, names: readonly string[]): boolean =>
  typeof value === 'object' &&
  value !== null &&
  names.every((name) => typeof Reflect.get(value, name) === 'string');
const isVector = (value: unknown): value is Vector =>
  typeof value === 'object' &&
  value !== null &&
  strings(value, ['secretKey', 'entry']) &&
  strings(Reflect.get(value, 'coin'), ['nonce', 'color', 'value']);
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url), 'utf8'));
const vectors: unknown = Reflect.get(Object(fixture('inbox-vectors.json')), 'vectors');
assert.ok(
  Array.isArray(vectors) && vectors.every(isVector),
  'the vectors file has the wrong shape',
);
const bytes = (hex: string) => new Uint8Array(Buffer.from(hex, 'hex'));

// Node's own crypto, so the key side does not share code with the codec.
const PKCS8 = Buffer.from('302e020100300506032b656e04220420', 'hex');
const SPKI = Buffer.from('302a300506032b656e032100', 'hex');
const keyOf =
  (secret: Uint8Array): InboxKey =>
  (ephemeral) => {
    let shared: Buffer;
    try {
      shared = diffieHellman({
        privateKey: createPrivateKey({
          key: Buffer.concat([PKCS8, secret]),
          format: 'der',
          type: 'pkcs8',
        }),
        publicKey: createPublicKey({
          key: Buffer.concat([SPKI, ephemeral]),
          format: 'der',
          type: 'spki',
        }),
      });
    } catch {
      return Promise.resolve(undefined);
    }
    if (shared.every((b) => b === 0)) return Promise.resolve(undefined);
    return Promise.resolve(
      new Uint8Array(
        hkdfSync('sha256', shared, new Uint8Array(0), 'midnight:custody:inbox:v1', 32),
      ),
    );
  };
const newKeys = () => {
  const pair = generateKeyPairSync('x25519');
  const raw = (der: Buffer) => new Uint8Array(der.subarray(der.length - 32));
  return {
    secret: raw(pair.privateKey.export({ format: 'der', type: 'pkcs8' })),
    public: raw(pair.publicKey.export({ format: 'der', type: 'spki' })),
  };
};

const [first] = vectors;
assert.ok(first);
const entry = bytes(first.entry);
const mine = keyOf(bytes(first.secretKey));

test('every entry that the reference sealed opens here to the same coin', async () => {
  assert.equal(vectors.length, 4);
  for (const v of vectors) {
    const coin = {
      nonce: bytes(v.coin.nonce),
      color: bytes(v.coin.color),
      value: BigInt(v.coin.value),
    };
    const secret = bytes(v.secretKey);
    assert.deepEqual(await openInboxEntry(bytes(v.entry), keyOf(secret)), coin);
    assert.deepEqual(await openInboxEntry(bytes(v.entry), (e) => deriveInboxKey(secret, e)), coin);
    assert.deepEqual(secret, bytes(v.secretKey), 'the holder keeps its secret');
  }
});

test('deriveInboxKey gives no key for a low-order point, and rejects a secret of the wrong length', async () => {
  const secret = bytes(first.secretKey);
  assert.equal(await deriveInboxKey(secret, new Uint8Array(32)), undefined);
  assert.equal(await deriveInboxKey(secret, Uint8Array.of(1, ...new Uint8Array(31))), undefined);
  await assert.rejects(deriveInboxKey(new Uint8Array(31), entry.slice(2, 34)), RangeError);
});

test('an SDK seal opens with the same open, has zero padding, and is new each time', async () => {
  const keys = newKeys();
  const coin = { nonce: new Uint8Array(32).fill(1), color: new Uint8Array(32).fill(2), value: 77n };
  const a = await sealInboxEntry(keys.public, coin);
  const b = await sealInboxEntry(keys.public, coin);
  assert.deepEqual(await openInboxEntry(a, keyOf(keys.secret)), coin);
  assert.ok(a.subarray(142).every((x) => x === 0));
  assert.notDeepEqual(a.subarray(2, 46), b.subarray(2, 46));
});

test('an entry that is not ours gives undefined, never a throw', async () => {
  const flip = (at: number) => entry.map((b, i) => (i === at ? b ^ 1 : b));
  const lowOrder = entry.slice();
  lowOrder.fill(0, 2, 34);
  const cases = [flip(0), flip(1), flip(40), flip(50), flip(100), entry.subarray(0, 191), lowOrder];
  for (const changed of cases) assert.equal(await openInboxEntry(changed, mine), undefined);
  assert.equal(await openInboxEntry(entry, keyOf(newKeys().secret)), undefined);
});

test('a key holder that fails gives InboxKeyError with no cause, not "not ours"', async () => {
  const secretText = 'kernel locked, key 68bf703b';
  const failing: InboxKey = () => Promise.reject(new Error(secretText));
  const error = await openInboxEntry(entry, failing).then(
    () => assert.fail('it opened'),
    (e: unknown) => e,
  );
  assert.ok(error instanceof InboxKeyError);
  assert.equal(error.cause, undefined);
  assert.ok(!error.message.includes(secretText));
  await assert.rejects(
    openInboxEntry(entry, () => Promise.resolve(new Uint8Array(16))),
    InboxKeyError,
  );
});

test('a recipient key with no agreement is refused, and a bad coin is a RangeError', async () => {
  const coin = { nonce: new Uint8Array(32), color: new Uint8Array(32), value: 1n };
  await assert.rejects(sealInboxEntry(new Uint8Array(32), coin), InboxRecipientKeyError);
  await assert.rejects(sealInboxEntry(new Uint8Array(31), coin), InboxRecipientKeyError);
  const key = newKeys().public;
  await assert.rejects(sealInboxEntry(key, { ...coin, value: 1n << 128n }), RangeError);
  await assert.rejects(sealInboxEntry(key, { ...coin, value: -1n }), RangeError);
  await assert.rejects(sealInboxEntry(key, { ...coin, nonce: new Uint8Array(31) }), RangeError);
});
