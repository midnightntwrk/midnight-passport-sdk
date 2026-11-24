import { createHash } from 'node:crypto';
import { p256 } from '@noble/curves/nist.js';
import {
  webauthnChallenge,
  webauthnClientData,
  webauthnDigest,
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
  /** Each get adds Chrome's GREASE member when this is true. */
  grease: boolean;
  flags: number;
  /** Changes the client data of each assertion. */
  getClientData?: (json: Uint8Array) => Uint8Array;
  signingKey?: Uint8Array;
  prompts: number;
  lastUserId: Uint8Array | undefined;
}

/** An authenticator in memory with one ES256 credential. */
export function fakeAuthenticator(secretKey = new Uint8Array(32).fill(5)): {
  authenticator: FakeAuthenticator;
  webauthn: WebAuthn;
} {
  const authenticator: FakeAuthenticator = {
    secretKey,
    prompts: 0,
    lastUserId: undefined,
    grease: false,
    flags: 5,
  };
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
    get(options) {
      authenticator.prompts++;
      const rpIdHash = createHash('sha256').update(options.rpId).digest();
      const authenticatorData = Uint8Array.from([...rpIdHash, authenticator.flags, 0, 0, 0, 0]);
      const plain = webauthnClientData(options.challenge, origin, authenticator.grease);
      const clientDataJSON = authenticator.getClientData?.(plain) ?? plain;
      const digest = webauthnDigest(authenticatorData, clientDataJSON);
      const key = authenticator.signingKey ?? secretKey;
      return Promise.resolve({
        credentialId: options.allowCredentialIds?.[0] ?? new Uint8Array(16),
        clientDataJSON,
        authenticatorData,
        signature: p256.sign(digest, key, { prehash: false, format: 'der' }),
        userHandle: undefined,
        prf: undefined,
        userVerified: (authenticator.flags & 0x04) !== 0,
      });
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
