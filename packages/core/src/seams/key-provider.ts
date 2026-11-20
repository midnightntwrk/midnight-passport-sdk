import type { CallOptions } from './common.js';

export type Authorization =
  | {
      readonly scheme: 'jubjub';
      /** Holds the commitment R, the scalar s, and the grinding nonce. Its layout is not fixed yet. */
      readonly signature: Uint8Array;
    }
  | {
      readonly scheme: 'k256';
      readonly envelope: 0 | 1;
      /** 64 bytes: r and s, each 32 bytes big-endian. */
      readonly signature: Uint8Array;
    }
  | {
      readonly scheme: 'p256';
      /** 64 bytes: r and s, each 32 bytes big-endian. A WebAuthn adapter converts the DER signature. */
      readonly signature: Uint8Array;
      readonly authenticatorData: Uint8Array;
      readonly clientDataJSON: Uint8Array;
    };

interface KeyProviderBase {
  /**
   * Can prompt the user. k256 and p256: 64 bytes, x and y, each 32 bytes big-endian; a
   * WebAuthn adapter converts the SPKI key. JubJub: not fixed yet.
   */
  publicKey(options?: CallOptions): Promise<Uint8Array>;
  /**
   * `challenge` is the 32-byte challenge of the circuit. Can prompt the user once.
   * A dismissed prompt rejects with `CancelledError` (`by: 'user'`).
   */
  sign(challenge: Uint8Array, options?: CallOptions): Promise<Authorization>;
}

/** `sign` resolves with an authorization of the provider's own scheme and envelope. */
export type KeyProvider =
  | (KeyProviderBase & { readonly scheme: 'jubjub' | 'p256' })
  | (KeyProviderBase & { readonly scheme: 'k256'; readonly envelope: 0 | 1 });
