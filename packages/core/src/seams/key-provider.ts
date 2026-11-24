import type { CallOptions } from './common.js';

export type Authorization =
  | {
      readonly scheme: 'jubjub';
      /** R: 64 bytes, x and y, each 32 bytes big-endian. */
      readonly commitment: Uint8Array;
      /** s: 32 bytes big-endian, below the JubJub order. */
      readonly response: Uint8Array;
      /** The nonce that `bind` found for R. */
      readonly grindNonce: bigint;
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

/** A JubJub challenge binds the signer's commitment R, so the signer finishes it. */
export interface JubjubChallenge {
  readonly authNonce: bigint;
  /** Grinds the nonce for R and gives the 32-byte challenge `c`. */
  bind(commitment: Uint8Array): { readonly bytes: Uint8Array; readonly grindNonce: bigint };
}

interface KeyProviderBase<C> {
  /**
   * Can prompt the user. 64 bytes, x and y, each 32 bytes big-endian; a WebAuthn adapter
   * converts the SPKI key.
   */
  publicKey(options?: CallOptions): Promise<Uint8Array>;
  /**
   * k256 and p256 take the 32-byte challenge of the circuit. Can prompt the user once.
   * A dismissed prompt rejects with `CancelledError` (`by: 'user'`).
   */
  sign(challenge: C, options?: CallOptions): Promise<Authorization>;
}

/** `sign` resolves with an authorization of the provider's own scheme and envelope. */
export type KeyProvider =
  | (KeyProviderBase<Uint8Array> & { readonly scheme: 'p256' })
  | (KeyProviderBase<Uint8Array> & { readonly scheme: 'k256'; readonly envelope: 0 | 1 })
  | (KeyProviderBase<JubjubChallenge> & { readonly scheme: 'jubjub' });
