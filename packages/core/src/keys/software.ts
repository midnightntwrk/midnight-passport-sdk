import { jubjub } from '@noble/curves/misc.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { CancelledError } from '../seams/errors.js';
import type { CallOptions } from '../seams/common.js';
import type { KeyProvider } from '../seams/key-provider.js';
import { JUBJUB_ORDER, be32, bigEndian, envelopeDigest, littleEndian } from './challenge.js';

export interface SoftwareKeyOptions {
  readonly scheme: 'k256' | 'jubjub';
  /** 32 bytes, big-endian. The provider keeps a copy. */
  readonly secretKey: Uint8Array;
}

export type SoftwareK256Provider = KeyProvider & { readonly scheme: 'k256'; readonly envelope: 0 };
export type SoftwareJubjubProvider = KeyProvider & { readonly scheme: 'jubjub' };

// The contract's generator, `compute_public_point_with_jubjub(1)`. It is not noble's base point.
const GENERATOR = jubjub.Point.fromAffine({
  x: 0x3ea5c4673a121ca35ed37ee3b172f5ee04315c657fbe375f512dfea318d56fe5n,
  y: 0x57137b83ea6edb4f78f7d30d3f616cb3b9aa6e8e40808413c10cea38d50c55cbn,
});

const checkAbort = (callOptions?: CallOptions): void => {
  if (callOptions?.signal?.aborted) throw new CancelledError('caller');
};

function jubjubProvider(secretKey: Uint8Array): SoftwareJubjubProvider {
  const sk = bigEndian(secretKey);
  if (secretKey.length !== 32 || sk === 0n || sk >= JUBJUB_ORDER) {
    throw new RangeError('secretKey must be a JubJub scalar from 1 to r - 1.');
  }
  const pointBytes = (p: typeof GENERATOR): Uint8Array => {
    const { x, y } = p.toAffine();
    return Uint8Array.from([...be32(x), ...be32(y)]);
  };
  const publicKey = pointBytes(GENERATOR.multiply(sk));
  return {
    scheme: 'jubjub',
    publicKey: async (callOptions?: CallOptions) => {
      checkAbort(callOptions);
      return publicKey.slice();
    },
    sign: async (challenge, callOptions?: CallOptions) => {
      checkAbort(callOptions);
      // 64 random bytes, so the reduction bias is below 2^-250. A zero k would leak the key.
      let k = 0n;
      while (k === 0n) k = bigEndian(randomBytes(64)) % JUBJUB_ORDER;
      const commitment = pointBytes(GENERATOR.multiply(k));
      const { bytes, grindNonce } = challenge.bind(commitment);
      const response = be32((k + littleEndian(bytes) * sk) % JUBJUB_ORDER);
      return { scheme: 'jubjub', commitment, response, grindNonce };
    },
  };
}

function k256Provider(secretKey: Uint8Array): SoftwareK256Provider {
  if (!secp256k1.utils.isValidSecretKey(secretKey)) {
    throw new RangeError('secretKey must be a secp256k1 scalar from 1 to n - 1.');
  }
  // Uncompressed SEC 1 is 0x04, x, y. The seam takes x and y only.
  const publicKey = secp256k1.getPublicKey(secretKey, false).slice(1);
  return {
    scheme: 'k256',
    envelope: 0,
    publicKey: async (callOptions?: CallOptions) => {
      checkAbort(callOptions);
      return publicKey.slice();
    },
    sign: async (challenge: Uint8Array, callOptions?: CallOptions) => {
      checkAbort(callOptions);
      const digest = envelopeDigest(0, challenge);
      const signature = secp256k1.sign(digest, secretKey, { prehash: false });
      return { scheme: 'k256', envelope: 0, signature };
    },
  };
}

/**
 * A key in memory. It has no prompt, so only an abort cancels it. k256 signs on envelope 0. A
 * JubJub signature uses a fresh random nonce from `crypto.getRandomValues`.
 */
export function createSoftwareKeyProvider(
  options: SoftwareKeyOptions & { readonly scheme: 'k256' },
): SoftwareK256Provider;
export function createSoftwareKeyProvider(
  options: SoftwareKeyOptions & { readonly scheme: 'jubjub' },
): SoftwareJubjubProvider;
export function createSoftwareKeyProvider(
  options: SoftwareKeyOptions,
): SoftwareK256Provider | SoftwareJubjubProvider {
  const secretKey = options.secretKey.slice();
  return options.scheme === 'jubjub' ? jubjubProvider(secretKey) : k256Provider(secretKey);
}
