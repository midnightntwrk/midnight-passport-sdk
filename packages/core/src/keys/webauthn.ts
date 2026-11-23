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

/** The exact `clientDataJSON` that the contract rebuilds. Chrome sometimes adds the GREASE member. */
export function webauthnClientData(
  challenge: Uint8Array,
  origin: string,
  chromeGrease: boolean,
): Uint8Array {
  if (!ORIGIN.test(origin)) {
    throw new RangeError('origin must be printable ASCII with no quote and no backslash.');
  }
  const c = base64url(bytes(challenge, 32, 'challenge'));
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

/**
 * Throws `AssertionProfileError` where the contract would refuse the assertion. `publicKey` is
 * the enrolled key, 64 bytes, `x` then `y`, big-endian. `chromeGrease` goes into `P256Auth`.
 */
export function checkP256Assertion(
  assertion: P256Assertion,
  context: {
    readonly challenge: Uint8Array;
    readonly publicKey: Uint8Array;
    readonly policy: WebAuthnPolicy;
    readonly originLength: number;
  },
): { readonly chromeGrease: boolean } {
  const { challenge, policy, originLength } = context;
  const publicKey = Uint8Array.from([4, ...bytes(context.publicKey, 64, 'publicKey')]);
  const fail = (reason: AssertionProfileReason): never => {
    throw new AssertionProfileError(reason);
  };
  if (policy.origin.length !== originLength || !ORIGIN.test(policy.origin)) fail('origin');
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
