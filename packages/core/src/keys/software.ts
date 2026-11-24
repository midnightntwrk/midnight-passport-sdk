import { secp256k1 } from '@noble/curves/secp256k1.js';
import { CancelledError } from '../seams/errors.js';
import type { CallOptions } from '../seams/common.js';
import type { KeyProvider } from '../seams/key-provider.js';
import { envelopeDigest } from './challenge.js';

export interface SoftwareKeyOptions {
  readonly scheme: 'k256';
  /** 32 bytes, big-endian. The provider keeps a copy. */
  readonly secretKey: Uint8Array;
}

export type SoftwareKeyProvider = KeyProvider & { readonly scheme: 'k256'; readonly envelope: 0 };

/** A key in memory, on envelope 0. It has no prompt, so only an abort cancels it. */
export function createSoftwareKeyProvider(options: SoftwareKeyOptions): SoftwareKeyProvider {
  const secretKey = options.secretKey.slice();
  if (!secp256k1.utils.isValidSecretKey(secretKey)) {
    throw new RangeError('secretKey must be a secp256k1 scalar from 1 to n - 1.');
  }
  // Uncompressed SEC 1 is 0x04, x, y. The seam takes x and y only.
  const publicKey = secp256k1.getPublicKey(secretKey, false).slice(1);
  const checkAbort = (callOptions?: CallOptions): void => {
    if (callOptions?.signal?.aborted) throw new CancelledError('caller');
  };
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
