import { PassportError } from '@midnight-ntwrk/mn-passport-core';
import { DOMAIN_TAGS } from '@midnight-ntwrk/mn-passport-protocol';
import type { Signature, SignatureVerifyingKey, SigningKey } from '@midnightntwrk/ledger-v9';
import type { Ledger } from '../deploy/price.js';
import { ascii, fromHex, toHex } from '../bytes.js';
import { hkdf32, randomBytes, sha256, subtle, type CryptoKey } from './web-crypto.js';
import { zeroize } from './zeroize.js';

export interface PrfInputs {
  /** The authority wrap input. */
  readonly first: Uint8Array;
  /** The viewing wrap input. */
  readonly second: Uint8Array;
}

/** The `eval` inputs of the WebAuthn PRF extension. */
export async function prfInputs(): Promise<PrfInputs> {
  return {
    first: await sha256(ascii(DOMAIN_TAGS.prfAuthority)),
    second: await sha256(ascii(DOMAIN_TAGS.prfViewing)),
  };
}

export interface PrfResult {
  readonly first?: Uint8Array;
  readonly second?: Uint8Array;
  /** The UV flag of the assertion. Without UV, some authenticators use another PRF secret. */
  readonly userVerified: boolean;
}

export class PrfUnavailableError extends PassportError {
  readonly _tag = 'PrfUnavailableError';
  readonly code = 'PRF_UNAVAILABLE';

  constructor(missing: string) {
    super(`The passkey gave no usable PRF result (${missing}).`);
    this.name = 'PrfUnavailableError';
  }
}

export class AuthorityKeyMismatchError extends PassportError {
  readonly _tag = 'AuthorityKeyMismatchError';
  readonly code = 'AUTHORITY_KEY_MISMATCH';

  constructor() {
    super("This passkey's PRF does not give the account's maintenance authority key.");
    this.name = 'AuthorityKeyMismatchError';
  }
}

/** Zeros the outputs of `result` that it reads. */
export function takePrf(result: PrfResult, which: 'first' | 'second'): Uint8Array {
  if (!result.userVerified) throw new PrfUnavailableError('no user verification');
  const output = result[which];
  if (output?.length !== 32) throw new PrfUnavailableError(`no ${which} output`);
  const copy = output.slice();
  zeroize(output);
  return copy;
}

const SECP256K1_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
// An X25519 private key in PKCS #8 is a fixed 16-byte header, then the 32 key bytes.
const X25519_PKCS8_HEADER_BYTES = 16;
const WRAP_VERSION = 0x01;
const NONCE_BYTES = 12;

export interface WrappedKey {
  /** The associated data of the wrap. */
  readonly publicKey: Uint8Array;
  /** `version ‖ nonce ‖ AES-256-GCM(secret)`. */
  readonly wrap: Uint8Array;
}

async function wrapKey(prf: Uint8Array, info: string): Promise<CryptoKey> {
  const bytes = await hkdf32(prf, info);
  try {
    return await subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  } finally {
    zeroize(bytes);
  }
}

async function wrap(
  prf: Uint8Array,
  info: string,
  publicKey: Uint8Array,
  secret: Uint8Array,
): Promise<WrappedKey> {
  const nonce = randomBytes(NONCE_BYTES);
  const sealed = new Uint8Array(
    await subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: publicKey },
      await wrapKey(prf, info),
      secret,
    ),
  );
  return { publicKey, wrap: Uint8Array.of(WRAP_VERSION, ...nonce, ...sealed) };
}

async function unwrap(
  prf: Uint8Array,
  info: string,
  key: WrappedKey,
): Promise<Uint8Array | undefined> {
  if (key.wrap[0] !== WRAP_VERSION) return undefined;
  const secret = await subtle
    .decrypt(
      { name: 'AES-GCM', iv: key.wrap.subarray(1, 1 + NONCE_BYTES), additionalData: key.publicKey },
      await wrapKey(prf, info),
      key.wrap.subarray(1 + NONCE_BYTES),
    )
    // A failed tag is the only rejection here.
    .catch(() => undefined);
  return secret === undefined ? undefined : new Uint8Array(secret);
}

// TODO: the PRF wrap of this key is provisional until the maintenance-key decision.
/** A random BIP-340 maintenance authority key for one account. At rest only its PRF wrap exists. */
export class AuthorityKey {
  /** The ledger takes the key as a hex string. A string cannot be zeroed. */
  #key: SigningKey | undefined;
  readonly verifyingKey: SignatureVerifyingKey;
  readonly #ledger: Ledger;

  private constructor(ledger: Ledger, secret: Uint8Array) {
    this.#ledger = ledger;
    this.#key = { tag: 'schnorr', value: toHex(secret) };
    this.verifyingKey = ledger.signatureVerifyingKey(this.#key);
  }

  /** A new key and its wrap under `prf`. Zeros `prf`. Only a test replaces `random`. */
  static async create(
    ledger: Ledger,
    prf: Uint8Array,
    random: (length: number) => Uint8Array = randomBytes,
  ): Promise<{ readonly key: AuthorityKey; readonly wrapped: WrappedKey }> {
    let secret = random(32);
    try {
      // Out of range with odds of about 2^-128.
      while (!inOrder(secret)) {
        zeroize(secret);
        secret = random(32);
      }
      const key = new AuthorityKey(ledger, secret);
      const publicKey = fromHex(key.verifyingKey.value);
      return { key, wrapped: await wrap(prf, DOMAIN_TAGS.authorityWrap, publicKey, secret) };
    } finally {
      zeroize(secret);
      zeroize(prf);
    }
  }

  /** `undefined` for a wrap that this PRF output and public key do not open. Zeros `prf`. */
  static async open(
    ledger: Ledger,
    prf: Uint8Array,
    wrapped: WrappedKey,
  ): Promise<AuthorityKey | undefined> {
    let secret: Uint8Array | undefined;
    try {
      secret = await unwrap(prf, DOMAIN_TAGS.authorityWrap, wrapped);
      if (secret === undefined) return undefined;
      const key = new AuthorityKey(ledger, secret);
      return key.verifyingKey.value === toHex(wrapped.publicKey) ? key : undefined;
    } finally {
      if (secret !== undefined) zeroize(secret);
      zeroize(prf);
    }
  }

  /** Refuses a key that is not the committee key of the account. */
  requireCommittee(committee: readonly SignatureVerifyingKey[]): void {
    if (!committee.some((k) => k.tag === 'schnorr' && k.value === this.verifyingKey.value)) {
      throw new AuthorityKeyMismatchError();
    }
  }

  sign(data: Uint8Array): Signature {
    if (this.#key === undefined) throw new Error('The authority key was disposed.');
    return this.#ledger.signData(this.#key, data);
  }

  dispose(): void {
    this.#key = undefined;
  }
}

function inOrder(secret: Uint8Array): boolean {
  const scalar = BigInt(`0x${toHex(secret)}`);
  return scalar > 0n && scalar < SECP256K1_ORDER;
}

/**
 * A fresh X25519 viewing secret, held by `hold` and also returned wrapped. The public key is
 * the constructor's `encryption_key`. Zeros `prf`.
 */
export async function createViewingKey(
  prf: Uint8Array,
  hold: (secret: Uint8Array) => void,
): Promise<WrappedKey> {
  try {
    const pair = await subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
    const publicKey = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
    const pkcs8 = new Uint8Array(await subtle.exportKey('pkcs8', pair.privateKey));
    const secret = pkcs8.slice(X25519_PKCS8_HEADER_BYTES);
    zeroize(pkcs8);
    const wrapped = await wrap(prf, DOMAIN_TAGS.viewingWrap, publicKey, secret);
    hold(secret);
    return wrapped;
  } finally {
    zeroize(prf);
  }
}

/** `undefined` for a wrap that this PRF output and public key do not open. Zeros `prf`. */
export async function openViewingKey(
  prf: Uint8Array,
  key: WrappedKey,
): Promise<Uint8Array | undefined> {
  try {
    return await unwrap(prf, DOMAIN_TAGS.viewingWrap, key);
  } finally {
    zeroize(prf);
  }
}
