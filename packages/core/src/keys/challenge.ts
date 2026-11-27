import { sha256 } from '@noble/hashes/sha2.js';
import {
  DEVICE_AUTH_TAG_PREFIXES,
  K256_CONNECTOR_PREFIX,
} from '@midnight-ntwrk/mn-passport-protocol';
import type { ContractAddress } from '../seams/common.js';
import type { JubjubChallenge } from '../seams/key-provider.js';

export interface ShieldedCoin {
  readonly nonce: Uint8Array;
  readonly color: Uint8Array;
  readonly value: bigint;
  readonly mtIndex: bigint;
}

/**
 * A key is the contract's operation name, and it goes into the tag hash. Byte fields are exactly
 * the contract's width; a point is 64 bytes, `x` then `y`, big-endian. `coin` is the value that the
 * circuit's `held_coin` witness will return, and `scopeDigest` is `derive_grant_scope_digest`.
 */
export interface DeviceOperationArgs {
  readonly withdraw_unshielded: {
    readonly color: Uint8Array;
    readonly amount: bigint;
    readonly recipient: Uint8Array;
  };
  readonly withdraw_shielded: {
    readonly recipient: Uint8Array;
    readonly color: Uint8Array;
    readonly amount: bigint;
    readonly coin: ShieldedCoin;
  };
  readonly withdraw_shielded_to_contract: {
    readonly recipient: ContractAddress;
    readonly color: Uint8Array;
    readonly amount: bigint;
    readonly coin: ShieldedCoin;
  };
  readonly append_inbox: { readonly entry: Uint8Array };
  readonly rotate_enc_key: { readonly key: Uint8Array };
  readonly add_device: { readonly entry: Uint8Array };
  readonly remove_device: { readonly entry: Uint8Array };
  readonly issue_grant: { readonly grantId: Uint8Array; readonly scopeDigest: Uint8Array };
  readonly revoke_grant: { readonly grantId: Uint8Array };
  readonly revoke_all_grants: Readonly<Record<string, never>>;
  readonly publish_recovery_session: {
    readonly recoveryKey: Uint8Array;
    readonly sessionNonce: Uint8Array;
    readonly phi1: bigint;
    readonly phi2: bigint;
    readonly phi3: bigint;
    readonly phi4: bigint;
    readonly phiLength: bigint;
    readonly wrap: Uint8Array;
  };
  readonly recover_cancel: Readonly<Record<string, never>>;
}

export type DeviceOperation = keyof DeviceOperationArgs;

export interface ChallengeContext {
  readonly address: ContractAddress;
  /** 64 bytes, `x` then `y`, big-endian. */
  readonly publicKey: Uint8Array;
  /** The ledger's `auth_nonce` that the caller read. */
  readonly authNonce: bigint;
}

export interface DeviceChallenge {
  /** The 32-byte challenge `c` of the circuit. */
  readonly bytes: Uint8Array;
  readonly authNonce: bigint;
}

export const JUBJUB_ORDER = 0xe7db4ea6533afa906673b0101343b00a6682093ccc81082d0970e5ed6f72cb7n;
// About 1 try in 18 passes, so 2^16 tries all fail with a chance below 2^-5000.
const GRIND_LIMIT = 1n << 16n;
const FIELD_MODULUS = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001n;
// Every tag and prefix is ASCII. The ES2022 lib has no TextEncoder.
export const ascii = (text: string): Uint8Array =>
  Uint8Array.from(text, (char) => char.charCodeAt(0));
const CONNECTOR_PREFIX = ascii(K256_CONNECTOR_PREFIX);

export function bytes(value: Uint8Array, length: number, name: string): Uint8Array {
  if (value.length !== length) throw new RangeError(`${name} must be ${length} bytes.`);
  return value;
}

function uint(value: bigint, bits: number, name: string): Uint8Array {
  if (value < 0n || value >= 1n << BigInt(bits)) {
    throw new RangeError(`${name} must fit in Uint<${bits}>.`);
  }
  const out = new Uint8Array(Math.ceil(bits / 8));
  let rest = value;
  for (let i = 0; i < out.length; i++) {
    out[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return out;
}

function field(value: bigint, name: string): Uint8Array {
  if (value < 0n || value >= FIELD_MODULUS) throw new RangeError(`${name} must be a Field.`);
  return uint(value, 256, name);
}

// The seam gives big-endian coordinates; the contract hashes them little-endian.
function point(value: Uint8Array, name: string): Uint8Array[] {
  bytes(value, 64, name);
  return [value.slice(0, 32).reverse(), value.slice(32).reverse()];
}

function address(value: ContractAddress, name: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(value))
    throw new RangeError(`${name} must be 64 lowercase hex digits.`);
  return Uint8Array.from(value.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

function coin(value: ShieldedCoin): Uint8Array[] {
  return [
    bytes(value.nonce, 32, 'coin.nonce'),
    bytes(value.color, 32, 'coin.color'),
    uint(value.value, 128, 'coin.value'),
    uint(value.mtIndex, 64, 'coin.mtIndex'),
  ];
}

// Each list is in the contract's argument order.
const ENCODERS: {
  readonly [K in DeviceOperation]: (args: DeviceOperationArgs[K]) => Uint8Array[];
} = {
  withdraw_unshielded: (a) => [
    bytes(a.color, 32, 'color'),
    uint(a.amount, 128, 'amount'),
    bytes(a.recipient, 32, 'recipient'),
  ],
  withdraw_shielded: (a) => [
    bytes(a.recipient, 32, 'recipient'),
    bytes(a.color, 32, 'color'),
    uint(a.amount, 128, 'amount'),
    ...coin(a.coin),
  ],
  withdraw_shielded_to_contract: (a) => [
    address(a.recipient, 'recipient'),
    bytes(a.color, 32, 'color'),
    uint(a.amount, 128, 'amount'),
    ...coin(a.coin),
  ],
  append_inbox: (a) => [bytes(a.entry, 192, 'entry')],
  rotate_enc_key: (a) => [bytes(a.key, 32, 'key')],
  add_device: (a) => [bytes(a.entry, 32, 'entry')],
  remove_device: (a) => [bytes(a.entry, 32, 'entry')],
  issue_grant: (a) => [bytes(a.grantId, 32, 'grantId'), bytes(a.scopeDigest, 32, 'scopeDigest')],
  revoke_grant: (a) => [bytes(a.grantId, 32, 'grantId')],
  revoke_all_grants: () => [],
  publish_recovery_session: (a) => [
    ...point(a.recoveryKey, 'recoveryKey'),
    bytes(a.sessionNonce, 32, 'sessionNonce'),
    field(a.phi1, 'phi1'),
    field(a.phi2, 'phi2'),
    field(a.phi3, 'phi3'),
    field(a.phi4, 'phi4'),
    uint(a.phiLength, 8, 'phiLength'),
    bytes(a.wrap, 64, 'wrap'),
  ],
  recover_cancel: () => [],
};

export function hash(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return sha256(out);
}

function tagHash(tag: string): Uint8Array {
  const padded = new Uint8Array(64);
  padded.set(ascii(tag));
  return sha256(padded);
}

export const littleEndian = (data: Uint8Array): bigint =>
  data.reduceRight((value, byte) => (value << 8n) | BigInt(byte), 0n);
export const bigEndian = (data: Uint8Array): bigint =>
  data.reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);
/** A value below 2^256 as 32 bytes, big-endian. */
export const be32 = (value: bigint): Uint8Array =>
  Uint8Array.from({ length: 32 }, (_, i) => Number((value >> BigInt(8 * (31 - i))) & 0xffn));

/**
 * The challenge of `<operation>_with_<arm>` for the pinned account contract. A value out of its
 * contract range throws `RangeError`. JubJub gives a challenge that the signer binds to R.
 */
export function deviceChallenge<K extends DeviceOperation>(
  arm: 'jubjub',
  operation: K,
  args: DeviceOperationArgs[K],
  context: ChallengeContext,
): JubjubChallenge;
export function deviceChallenge<K extends DeviceOperation>(
  arm: 'k256' | 'p256',
  operation: K,
  args: DeviceOperationArgs[K],
  context: ChallengeContext,
): DeviceChallenge;
export function deviceChallenge<K extends DeviceOperation>(
  arm: 'jubjub' | 'k256' | 'p256',
  operation: K,
  args: DeviceOperationArgs[K],
  context: ChallengeContext,
): DeviceChallenge | JubjubChallenge {
  // A plain JS caller can pass any string, and `toString` is on every object.
  if (!Object.hasOwn(DEVICE_AUTH_TAG_PREFIXES, arm)) throw new RangeError(`Unknown arm ${arm}.`);
  if (!Object.hasOwn(ENCODERS, operation)) throw new RangeError(`Unknown operation ${operation}.`);
  const encode: (a: DeviceOperationArgs[K]) => Uint8Array[] = ENCODERS[operation];
  const { authNonce } = context;
  const head = [
    tagHash(DEVICE_AUTH_TAG_PREFIXES[arm] + operation),
    address(context.address, 'address'),
  ];
  const publicKey = point(context.publicKey, 'publicKey');
  const tail = [...encode(args), uint(authNonce, 64, 'authNonce')];
  if (arm !== 'jubjub') return { bytes: hash([...head, ...publicKey, ...tail]), authNonce };
  return {
    authNonce,
    bind(commitment) {
      const r = point(commitment, 'commitment');
      // The circuit casts `c` to a JubJub scalar, which is canonical only below the order.
      for (let grindNonce = 0n; grindNonce < GRIND_LIMIT; grindNonce++) {
        const bytes = hash([...head, ...r, ...publicKey, ...tail, uint(grindNonce, 64, 'grind')]);
        if (littleEndian(bytes) < JUBJUB_ORDER) return { bytes, grindNonce };
      }
      throw new Error('No grind nonce gives a challenge below the JubJub order.');
    },
  };
}

/** Envelope 0 signs `SHA-256(c)`. Envelope 1, the connector's `signData`, signs `SHA-256(prefix ‖ c)`. */
export function envelopeDigest(envelope: 0 | 1, challenge: Uint8Array): Uint8Array {
  if (envelope !== 0 && envelope !== 1) throw new RangeError('envelope must be 0 or 1.');
  const c = bytes(challenge, 32, 'challenge');
  return envelope === 1 ? hash([CONNECTOR_PREFIX, c]) : sha256(c);
}
