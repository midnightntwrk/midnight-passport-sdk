import { p256 } from '@noble/curves/nist.js';
import {
  CancelledError,
  webauthnClientData,
  webauthnDigest,
  type CallOptions,
  type KeyProvider,
  type P256Assertion,
  type WebAuthnPolicy,
} from '@midnight-ntwrk/mn-passport-core';
import { createHold } from '../abort.js';

export interface SoftwareP256Options {
  readonly secretKey: Uint8Array;
  readonly policy: WebAuthnPolicy;
  /** The authenticator flags byte. The default is 5: user present and user verified. */
  readonly flags?: number;
  readonly chromeGrease?: boolean;
}

export type SoftwareP256Provider = KeyProvider & {
  readonly scheme: 'p256';
  /** The next `sign` acts as if the user dismissed the prompt. */
  dismissNextPrompt(): void;
  /** The next call stays in flight until its signal aborts. */
  holdNext(): void;
};

/**
 * Signs real WebAuthn assertions with a key in memory. It claims user verification with no
 * authenticator, so it stays in `dev`.
 */
export function createSoftwareP256Provider(options: SoftwareP256Options): SoftwareP256Provider {
  const secretKey = options.secretKey.slice();
  if (!p256.utils.isValidSecretKey(secretKey)) {
    throw new RangeError('secretKey must be a P-256 scalar from 1 to n - 1.');
  }
  // Uncompressed SEC 1 is 0x04, x, y. The seam takes x and y only.
  const publicKey = p256.getPublicKey(secretKey, false).slice(1);
  const { policy, flags = 5, chromeGrease = false } = options;
  const authenticatorData = Uint8Array.from([...policy.rpIdHash, flags, 0, 0, 0, 0]);
  const hold = createHold();
  let dismiss = false;

  const authorize = (challenge: Uint8Array): P256Assertion => {
    const clientDataJSON = webauthnClientData(challenge, policy.origin, chromeGrease);
    const digest = webauthnDigest(authenticatorData, clientDataJSON);
    const signature = p256.sign(digest, secretKey, { prehash: false });
    return {
      scheme: 'p256',
      signature,
      authenticatorData: authenticatorData.slice(),
      clientDataJSON,
    };
  };

  return {
    scheme: 'p256',
    publicKey: (callOptions?: CallOptions) =>
      hold.run(callOptions?.signal, () => publicKey.slice()),
    sign: (challenge: Uint8Array, callOptions?: CallOptions) =>
      hold.run(callOptions?.signal, () => {
        if (!dismiss) return authorize(challenge);
        dismiss = false;
        throw new CancelledError('user');
      }),
    dismissNextPrompt() {
      dismiss = true;
    },
    holdNext: () => hold.next(),
  };
}
