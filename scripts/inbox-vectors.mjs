#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { sealInboxEntry } from '../packages/core/dist/index.js';

const [reference] = process.argv.slice(2);
if (reference === undefined) {
  throw new Error(
    'usage: inbox-vectors.mjs <passport>/contract/src/wallet/inbox.ts (build the SDK first)',
  );
}

/**
 * @typedef {{ nonce: Uint8Array, color: Uint8Array, value: bigint }} Coin
 * @typedef {object} Reference
 * @property {() => { publicKey: Uint8Array, secretKey: Uint8Array }} generateEncKeyPair
 * @property {(key: Uint8Array, coin: Coin) => Uint8Array} sealInboxEntry
 * @property {(secret: Uint8Array, entry: Uint8Array) => Coin | null} openInboxEntry
 */
/**
 * The reference is a TypeScript module outside this repo, so only its function names can be checked.
 * @param {unknown} value
 * @returns {value is Reference}
 */
const isReference = (value) =>
  typeof value === 'object' &&
  value !== null &&
  ['generateEncKeyPair', 'sealInboxEntry', 'openInboxEntry'].every(
    (name) => typeof Reflect.get(value, name) === 'function',
  );
/** @type {unknown} */
const ref = await import(pathToFileURL(reference).href);
if (!isReference(ref)) throw new Error(`${reference} does not export the reference inbox codec.`);

const hex = (/** @type {Uint8Array} */ b) => Buffer.from(b).toString('hex');
const same = (/** @type {Uint8Array} */ a, /** @type {Uint8Array} */ b) =>
  Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
const coinOf = (/** @type {bigint} */ value) => ({
  nonce: new Uint8Array(randomBytes(32)),
  color: new Uint8Array(randomBytes(32)),
  value,
});
const values = [0n, 1n, 123456789n, (1n << 128n) - 1n];

const vectors = values.map((value) => {
  const keys = ref.generateEncKeyPair();
  const coin = coinOf(value);
  return {
    secretKey: hex(keys.secretKey),
    coin: { nonce: hex(coin.nonce), color: hex(coin.color), value: String(value) },
    entry: hex(ref.sealInboxEntry(keys.publicKey, coin)),
  };
});

for (const value of values) {
  const keys = ref.generateEncKeyPair();
  const coin = coinOf(value);
  const opened = ref.openInboxEntry(keys.secretKey, await sealInboxEntry(keys.publicKey, coin));
  if (
    opened?.value !== value ||
    !same(opened.nonce, coin.nonce) ||
    !same(opened.color, coin.color)
  ) {
    throw new Error(`The reference did not open an SDK entry of value ${String(value)}.`);
  }
}

const out = new URL('../packages/core/test/fixtures/inbox-vectors.json', import.meta.url);
writeFileSync(out, `${JSON.stringify({ vectors }, null, 2)}\n`);
console.log(
  `Wrote ${String(vectors.length)} reference entries. The reference opened ${String(values.length)} SDK entries.`,
);
