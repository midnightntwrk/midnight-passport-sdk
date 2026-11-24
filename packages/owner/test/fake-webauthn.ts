import { p256 } from '@noble/curves/nist.js';
import {
  webauthnChallenge,
  type Platform,
  type WebAuthn,
  type WebAuthnPrfValues,
} from '@midnight-ntwrk/mn-passport-core';

export const origin = 'https://passport.test';
export const site = { rpId: 'passport.test', origin, originLength: origin.length };

// The SPKI header of an uncompressed P-256 key.
const SPKI = Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex');

export interface FakeAuthenticator {
  readonly secretKey: Uint8Array;
  /** Changes the client data of each create. */
  createClientData?: (fields: Record<string, unknown>) => Record<string, unknown> | string;
  createdPublicKey?: (spki: Uint8Array) => Uint8Array | undefined;
  /** The create gives PRF outputs, as some authenticators do. */
  prfAtCreate?: boolean;
  createdPrf?: WebAuthnPrfValues | undefined;
  prompts: number;
  lastUserId: Uint8Array | undefined;
}

/** An authenticator in memory with one ES256 credential. */
export function fakeAuthenticator(secretKey = new Uint8Array(32).fill(5)): {
  authenticator: FakeAuthenticator;
  webauthn: WebAuthn;
} {
  const authenticator: FakeAuthenticator = { secretKey, prompts: 0, lastUserId: undefined };
  const webauthn: WebAuthn = {
    create(options) {
      authenticator.prompts++;
      authenticator.lastUserId = options.user.id;
      const fields = {
        type: 'webauthn.create',
        challenge: webauthnChallenge(options.challenge),
        origin,
        crossOrigin: false,
      };
      const json = authenticator.createClientData?.(fields) ?? fields;
      const spki = Uint8Array.from([...SPKI, ...p256.getPublicKey(secretKey, false)]);
      const prf = (input: Uint8Array) => input.map((byte) => byte ^ 0x5a);
      const inputs = authenticator.prfAtCreate ? options.prf : undefined;
      authenticator.createdPrf = inputs && {
        first: prf(inputs.first),
        ...(inputs.second ? { second: prf(inputs.second) } : {}),
      };
      return Promise.resolve({
        credentialId: new Uint8Array(16).fill(1),
        clientDataJSON: Buffer.from(typeof json === 'string' ? json : JSON.stringify(json)),
        attestationObject: new Uint8Array(0),
        prf: authenticator.createdPrf,
        userVerified: true,
        publicKey: authenticator.createdPublicKey ? authenticator.createdPublicKey(spki) : spki,
      });
    },
    get() {
      return Promise.reject(new Error('not used'));
    },
  };
  return { authenticator, webauthn };
}

let counter = 0;
const unused = (): never => {
  throw new Error('not used');
};

/** A platform with only random bytes and the given WebAuthn. */
export function fakePlatform(webauthn: WebAuthn | undefined): Platform {
  return {
    http: unused,
    randomBytes: (length) => Uint8Array.from({ length }, () => ++counter % 256),
    loadRuntimes: unused,
    store: { get: unused, set: unused, delete: unused, keys: unused, wipe: unused },
    webauthn,
  };
}
