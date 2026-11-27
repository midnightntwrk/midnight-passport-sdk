import { DOMAIN_TAGS } from '@midnight-ntwrk/mn-passport-protocol';
import { PassportError } from '../passport-error.js';
import { ascii } from '../keys/challenge.js';

const ENTRY_SIZE = 192;
const VERSION = 0x01;
const SUITE = 0x01;
const PLAIN_SIZE = 80;
const TAG_SIZE = 16;
const HEADER = Uint8Array.of(VERSION, SUITE);
const INFO = ascii(DOMAIN_TAGS.inboxEntry);

// `core` has no platform types. Node.js 22 and current browsers give these.
interface WebKey {
  readonly type: string;
}
declare const crypto: {
  getRandomValues(bytes: Uint8Array): Uint8Array;
  readonly subtle: {
    generateKey(
      algorithm: { name: 'X25519' },
      extractable: boolean,
      usages: readonly string[],
    ): Promise<{ publicKey: WebKey; privateKey: WebKey }>;
    importKey(
      format: 'raw' | 'pkcs8',
      key: Uint8Array,
      algorithm: { name: 'X25519' } | 'HKDF' | 'AES-GCM',
      extractable: false,
      usages: readonly string[],
    ): Promise<WebKey>;
    exportKey(format: 'raw', key: WebKey): Promise<ArrayBuffer>;
    deriveBits(
      algorithm:
        | { name: 'X25519'; public: WebKey }
        | { name: 'HKDF'; hash: 'SHA-256'; salt: Uint8Array; info: Uint8Array },
      key: WebKey,
      length: 256,
    ): Promise<ArrayBuffer>;
    encrypt(
      algorithm: { name: 'AES-GCM'; iv: Uint8Array; additionalData: Uint8Array },
      key: WebKey,
      data: Uint8Array,
    ): Promise<ArrayBuffer>;
    decrypt(
      algorithm: { name: 'AES-GCM'; iv: Uint8Array; additionalData: Uint8Array },
      key: WebKey,
      data: Uint8Array,
    ): Promise<ArrayBuffer>;
  };
};

export interface CoinDescription {
  readonly nonce: Uint8Array;
  readonly color: Uint8Array;
  readonly value: bigint;
}

/**
 * Gives HKDF-SHA256(X25519(secret, ephemeralPublicKey), empty salt,
 * `DOMAIN_TAGS.inboxEntry`, 32 bytes). Gives `undefined` when the point has no
 * agreement (low order): a depositor chooses it. Rejects only when it cannot
 * serve, for example a locked kernel. `core` zeroes the bytes after use, so
 * give a new array for each call.
 */
export type InboxKey = (ephemeralPublicKey: Uint8Array) => Promise<Uint8Array | undefined>;

/** The account's `enc_key` is not a usable X25519 key. Nothing can be sealed to it. */
export class InboxRecipientKeyError extends PassportError {
  readonly _tag = 'InboxRecipientKeyError';
  readonly code = 'INBOX_RECIPIENT_KEY_INVALID';

  constructor() {
    super('The recipient encryption key is not a usable X25519 key.');
    this.name = 'InboxRecipientKeyError';
  }
}

/** Keeps no cause, because the holder's error can name the key. Open the entry again later. */
export class InboxKeyError extends PassportError {
  readonly _tag = 'InboxKeyError';
  readonly code = 'INBOX_KEY_UNAVAILABLE';

  constructor() {
    super('The inbox key holder gave no key.');
    this.name = 'InboxKeyError';
  }
}

async function entryKey(shared: Uint8Array): Promise<Uint8Array> {
  const ikm = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: INFO },
      ikm,
      256,
    ),
  );
}

async function sealKey(shared: Uint8Array): Promise<WebKey> {
  const key = await entryKey(shared);
  try {
    return await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
  } finally {
    key.fill(0);
  }
}

// Web Crypto imports an X25519 secret only as PKCS #8: this header, then the 32 bytes.
// prettier-ignore
const PKCS8_HEADER = Uint8Array.of(
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20,
);

/**
 * The `InboxKey` result for one X25519 secret. It is for the holder of the viewing secret, such
 * as the owner kernel. It does not zero `secret`. A secret that is not 32 bytes rejects.
 */
export async function deriveInboxKey(
  secret: Uint8Array,
  ephemeralPublicKey: Uint8Array,
): Promise<Uint8Array | undefined> {
  if (secret.length !== 32) throw new RangeError('An X25519 secret is 32 bytes.');
  const pkcs8 = new Uint8Array(PKCS8_HEADER.length + secret.length);
  pkcs8.set(PKCS8_HEADER, 0);
  pkcs8.set(secret, PKCS8_HEADER.length);
  let own: WebKey;
  try {
    own = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'X25519' }, false, ['deriveBits']);
  } finally {
    pkcs8.fill(0);
  }
  let shared: Uint8Array;
  try {
    const peer = await crypto.subtle.importKey(
      'raw',
      ephemeralPublicKey,
      { name: 'X25519' },
      false,
      [],
    );
    shared = new Uint8Array(
      await crypto.subtle.deriveBits({ name: 'X25519', public: peer }, own, 256),
    );
  } catch {
    // A depositor chooses the point. A low-order one has no agreement, so the entry is not ours.
    return undefined;
  }
  try {
    return await entryKey(shared);
  } finally {
    shared.fill(0);
  }
}

/** A field out of range throws `RangeError`. */
export function checkCoin(coin: CoinDescription): void {
  if (coin.nonce.length !== 32 || coin.color.length !== 32) {
    throw new RangeError('The coin nonce and color are 32 bytes each.');
  }
  if (coin.value < 0n || coin.value >= 1n << 128n) {
    throw new RangeError('The coin value must fit in 128 bits.');
  }
}

function encode(coin: CoinDescription): Uint8Array {
  checkCoin(coin);
  const plain = new Uint8Array(PLAIN_SIZE);
  plain.set(coin.nonce, 0);
  plain.set(coin.color, 32);
  let value = coin.value;
  for (let i = PLAIN_SIZE - 1; i >= 64; i--) {
    plain[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return plain;
}

/**
 * Read `recipientKey` (the account's `enc_key`) from the chain for each seal,
 * also for a retry. A bad coin field throws `RangeError`.
 */
export async function sealInboxEntry(
  recipientKey: Uint8Array,
  coin: CoinDescription,
): Promise<Uint8Array> {
  const plain = encode(coin);
  if (recipientKey.length !== 32) throw new InboxRecipientKeyError();
  const ephemeral = await crypto.subtle.generateKey({ name: 'X25519' }, false, ['deriveBits']);
  let shared: Uint8Array;
  try {
    const peer = await crypto.subtle.importKey('raw', recipientKey, { name: 'X25519' }, false, []);
    shared = new Uint8Array(
      await crypto.subtle.deriveBits({ name: 'X25519', public: peer }, ephemeral.privateKey, 256),
    );
  } catch {
    // Web Crypto refuses an all-zero agreement, which a low-order key gives.
    throw new InboxRecipientKeyError();
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: HEADER },
      await sealKey(shared).finally(() => shared.fill(0)),
      plain,
    ),
  );
  const entry = new Uint8Array(ENTRY_SIZE);
  entry.set(HEADER, 0);
  entry.set(new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey)), 2);
  entry.set(iv, 34);
  // Web Crypto puts the tag after the ciphertext. The entry puts it first.
  entry.set(sealed.subarray(PLAIN_SIZE), 46);
  entry.set(sealed.subarray(0, PLAIN_SIZE), 46 + TAG_SIZE);
  return entry;
}

/**
 * `undefined` when the entry is not ours: a wrong length, version, or suite,
 * no agreement, or a failed tag. A depositor writes the entry, so no entry
 * makes this throw. Only a failed `key` call rejects, with `InboxKeyError`.
 */
export async function openInboxEntry(
  entry: Uint8Array,
  key: InboxKey,
): Promise<CoinDescription | undefined> {
  if (entry.length !== ENTRY_SIZE || entry[0] !== VERSION || entry[1] !== SUITE) return undefined;
  let aead: Uint8Array | undefined;
  try {
    aead = await key(entry.slice(2, 34));
  } catch {
    throw new InboxKeyError();
  }
  if (aead === undefined) return undefined;
  if (aead.length !== 32) throw new InboxKeyError();
  const sealed = new Uint8Array(PLAIN_SIZE + TAG_SIZE);
  sealed.set(entry.subarray(46 + TAG_SIZE, 46 + TAG_SIZE + PLAIN_SIZE), 0);
  sealed.set(entry.subarray(46, 46 + TAG_SIZE), PLAIN_SIZE);
  let plain: Uint8Array;
  try {
    const aes = await crypto.subtle.importKey('raw', aead, 'AES-GCM', false, ['decrypt']);
    plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: entry.slice(34, 46), additionalData: HEADER },
        aes,
        sealed,
      ),
    );
  } catch {
    return undefined;
  } finally {
    // Best effort: a JS runtime can keep copies.
    aead.fill(0);
  }
  let value = 0n;
  for (const byte of plain.subarray(64)) value = (value << 8n) | BigInt(byte);
  return { nonce: plain.slice(0, 32), color: plain.slice(32, 64), value };
}
