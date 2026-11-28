import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { RefusalError } from '../refusals.js';
import type { Authorization } from '../seams/key-provider.js';
import { ascii, bytes, hash } from './challenge.js';

export interface WebAuthnPolicy {
  /** SHA-256 of the RP ID. */
  readonly rpIdHash: Uint8Array;
  readonly origin: string;
}

/** The policy that the account binds for a passkey on this RP and origin. */
export function webauthnPolicy(rpId: string, origin: string): WebAuthnPolicy {
  // A domain name is ASCII; a non-ASCII one would hash to an RP that the authenticator never signs.
  if (!/^[!-~]+$/.test(rpId)) throw new RangeError('rpId must be an ASCII domain name.');
  return { rpIdHash: sha256(ascii(rpId)), origin };
}

export type P256Assertion = Extract<Authorization, { readonly scheme: 'p256' }>;

export type AssertionProfileReason =
  'origin' | 'client-data' | 'authenticator-data' | 'rp-id-hash' | 'flags' | 'signature';

/** The account contract would refuse the assertion, so a proof of it is wasted. */
export class AssertionProfileError extends RefusalError {
  static {
    this.prototype.name = 'AssertionProfileError';
  }

  readonly _tag = 'AssertionProfileError' as const;
  readonly code = 'ASSERTION_PROFILE' as const;
  readonly action = 'stop' as const;
  readonly reason: AssertionProfileReason;

  constructor(reason: AssertionProfileReason) {
    super(`The p256 assertion is outside the profile of the account contract: ${reason}.`);
    this.reason = reason;
  }
}

// Printable ASCII with no quote and no backslash, so the origin cannot add a JSON member.
const ORIGIN = /^[!#-[\]-~]+$/;
const GREASE =
  ',"other_keys_can_be_added_here":"do not compare clientDataJSON against a template. See https://goo.gl/yabPex"';
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
// User present and user verified, alone or with backup eligible, or with backup eligible and backed up.
const FLAGS: ReadonlySet<number | undefined> = new Set([5, 13, 29]);

function base64url(data: Uint8Array): string {
  let out = '';
  for (let i = 0; i < data.length; i += 3) {
    const n = ((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((data.length - i) * 8) / 6));
    for (let j = 0; j < chars; j++) out += BASE64URL.charAt((n >> (18 - 6 * j)) & 63);
  }
  return out;
}

/** The 43 unpadded base64url characters that carry the challenge in `clientDataJSON`. */
export function webauthnChallenge(challenge: Uint8Array): string {
  return base64url(bytes(challenge, 32, 'challenge'));
}

/** The contract can rebuild the client data of this origin: its length and its bytes. */
export function isProfileOrigin(origin: string, originLength: number): boolean {
  return origin.length === originLength && ORIGIN.test(origin);
}

/** The exact `clientDataJSON` that the contract rebuilds. Chrome sometimes adds the GREASE member. */
export function webauthnClientData(
  challenge: Uint8Array,
  origin: string,
  chromeGrease: boolean,
): Uint8Array {
  if (!ORIGIN.test(origin)) {
    throw new RangeError('origin must be printable ASCII with no quote and no backslash.');
  }
  const c = webauthnChallenge(challenge);
  const extra = chromeGrease ? GREASE : '';
  return ascii(
    `{"type":"webauthn.get","challenge":"${c}","origin":"${origin}","crossOrigin":false${extra}}`,
  );
}

/** The digest that the p256 key signs with ECDSA, with no further hash. */
export function webauthnDigest(
  authenticatorData: Uint8Array,
  clientDataJSON: Uint8Array,
): Uint8Array {
  return hash([bytes(authenticatorData, 37, 'authenticatorData'), sha256(clientDataJSON)]);
}

const equal = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, i) => byte === b[i]);

export interface P256CheckContext {
  readonly challenge: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly policy: WebAuthnPolicy;
  readonly originLength: number;
}

/**
 * Throws `AssertionProfileError` where the contract would refuse the assertion. `publicKey` is
 * the enrolled key, 64 bytes, `x` then `y`, big-endian. `chromeGrease` goes into `P256Auth`.
 */
export function checkP256Assertion(
  assertion: P256Assertion,
  context: P256CheckContext,
): { readonly chromeGrease: boolean } {
  const { challenge, policy, originLength } = context;
  const publicKey = Uint8Array.from([4, ...bytes(context.publicKey, 64, 'publicKey')]);
  const fail = (reason: AssertionProfileReason): never => {
    throw new AssertionProfileError(reason);
  };
  if (!isProfileOrigin(policy.origin, originLength)) fail('origin');
  const { clientDataJSON, authenticatorData, signature } = assertion;
  const shape = (grease: boolean) =>
    equal(clientDataJSON, webauthnClientData(challenge, policy.origin, grease));
  const chromeGrease = shape(true);
  if (!chromeGrease && !shape(false)) fail('client-data');
  if (authenticatorData.length !== 37) fail('authenticator-data');
  if (!equal(authenticatorData.subarray(0, 32), policy.rpIdHash)) fail('rp-id-hash');
  if (!FLAGS.has(authenticatorData[32])) fail('flags');
  const digest = webauthnDigest(authenticatorData, clientDataJSON);
  // The contract takes a high S as valid. noble returns false for r or s out of range.
  const verifyOptions = { prehash: false, lowS: false };
  if (signature.length !== 64 || !p256.verify(signature, digest, publicKey, verifyOptions)) {
    fail('signature');
  }
  return { chromeGrease };
}

// DER of SEQUENCE { SEQUENCE { id-ecPublicKey, prime256v1 }, BIT STRING { 04 ‖ x ‖ y } }.
const SPKI_PREFIX = Uint8Array.from(
  '3059301306072a8648ce3d020106082a8648ce3d030107034200'.match(/../g) ?? [],
  (byte) => parseInt(byte, 16),
);

/** The 64-byte key of a P-256 SPKI, as `getPublicKey()` gives it. Throws `RangeError` otherwise. */
export function p256KeyFromSpki(spki: Uint8Array): Uint8Array {
  const point = spki.subarray(SPKI_PREFIX.length);
  const prefix = spki.subarray(0, SPKI_PREFIX.length);
  if (
    spki.length !== 91 ||
    !equal(prefix, SPKI_PREFIX) ||
    !p256.utils.isValidPublicKey(point, false)
  ) {
    throw new RangeError('spki must be an uncompressed P-256 key on the curve.');
  }
  return point.slice(1);
}

/** The 64-byte `r ‖ s` of an ES256 assertion signature. A malformed one is refused as `signature`. */
export function p256SignatureFromDer(der: Uint8Array): Uint8Array {
  try {
    return p256.Signature.fromBytes(der, 'der').toBytes('compact');
  } catch {
    throw new AssertionProfileError('signature');
  }
}

/** The `P256Auth` argument of a p256 owner circuit, in the contract's own field names. */
export interface P256AuthArgument {
  readonly pk: { readonly x: bigint; readonly y: bigint; readonly identity: false };
  readonly use_counter: bigint;
  readonly policy: { readonly rp_id_hash: Uint8Array; readonly origin: Uint8Array };
  readonly authenticator_data: Uint8Array;
  readonly sig: { readonly r: bigint; readonly s: bigint };
  readonly chrome_grease: boolean;
}

const bigEndian = (data: Uint8Array): bigint =>
  data.reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);

/**
 * Checks the assertion as `checkP256Assertion` does, then encodes it. `useCounter` is the
 * counter of the device entry; with one device and no removal it equals `auth_nonce`.
 */
export function p256AuthArgument(
  assertion: P256Assertion,
  context: P256CheckContext & { readonly useCounter: bigint },
): P256AuthArgument {
  if (context.useCounter < 0n || context.useCounter >= 1n << 64n) {
    throw new RangeError('useCounter must be a Uint<64>.');
  }
  const { chromeGrease } = checkP256Assertion(assertion, context);
  const { publicKey, policy } = context;
  return {
    pk: {
      x: bigEndian(publicKey.subarray(0, 32)),
      y: bigEndian(publicKey.subarray(32)),
      identity: false,
    },
    use_counter: context.useCounter,
    policy: { rp_id_hash: policy.rpIdHash.slice(), origin: ascii(policy.origin) },
    authenticator_data: assertion.authenticatorData.slice(),
    sig: {
      r: bigEndian(assertion.signature.subarray(0, 32)),
      s: bigEndian(assertion.signature.subarray(32)),
    },
    chrome_grease: chromeGrease,
  };
}
