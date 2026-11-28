import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { p256 } from '@noble/curves/nist.js';
import {
  AssertionProfileError,
  p256AuthArgument,
  webauthnPolicy,
} from '@midnight-ntwrk/mn-passport-core';
import {
  PasskeyError,
  createPasskey,
  passkeyProvider,
  type PasskeyReason,
} from '@midnight-ntwrk/mn-passport-owner';
import { fakeAuthenticator, fakePlatform, site, type FakeAuthenticator } from './fake-webauthn.js';

const user = { name: 'alice', displayName: 'Alice' };
const refusal = (reason: PasskeyReason) => (error: unknown) =>
  error instanceof PasskeyError && error.reason === reason;

describe('createPasskey', () => {
  test('gives the credential key, and a random user id', async () => {
    const { authenticator, webauthn } = fakeAuthenticator();
    const platform = fakePlatform(webauthn);
    const { passkey, prf } = await createPasskey({ ...site, platform, rpName: 'Passport', user });
    const { passkey: again } = await createPasskey({ ...site, platform, rpName: 'Passport', user });
    const key = p256.getPublicKey(authenticator.secretKey, false).slice(1);
    assert.deepEqual(passkey.publicKey, key);
    assert.deepEqual(again.userId, authenticator.lastUserId);
    assert.equal(passkey.userId.length, 32);
    assert.notDeepEqual(passkey.userId, again.userId);
    assert.equal(authenticator.prompts, 2);
    assert.equal(prf, undefined);
  });

  test('reads both PRF inputs in the create prompt', async () => {
    const { authenticator, webauthn } = fakeAuthenticator();
    authenticator.prfAtCreate = true;
    const inputs = { first: new Uint8Array(32).fill(1), second: new Uint8Array(32).fill(2) };
    const platform = fakePlatform(webauthn);
    const { prf } = await createPasskey({ ...site, platform, rpName: 'P', user, prf: inputs });
    const expected = {
      first: new Uint8Array(32).fill(0x5b),
      second: new Uint8Array(32).fill(0x58),
    };
    assert.deepEqual(prf, { ...expected, userVerified: true });
    assert.equal(authenticator.prompts, 1);
  });

  for (const [name, origin] of [
    ['another length', 'https://passport.tst'],
    ['a quote', 'https://passport.tes"'],
  ] as const) {
    test(`refuses an origin with ${name} before any prompt`, async () => {
      const { authenticator, webauthn } = fakeAuthenticator();
      const platform = fakePlatform(webauthn);
      const options = { ...site, origin, platform, rpName: 'Passport', user };
      await assert.rejects(createPasskey(options), refusal('origin-rule'));
      assert.equal(authenticator.prompts, 0);
    });
  }

  test('refuses a platform with no WebAuthn', async () => {
    const options = { ...site, platform: fakePlatform(undefined), rpName: 'Passport', user };
    await assert.rejects(createPasskey(options), refusal('no-webauthn'));
  });

  const k256 = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const cases: Record<string, [PasskeyReason, (a: FakeAuthenticator) => void]> = {
    'client data that is not JSON': ['client-data', (a) => (a.createClientData = () => '{')],
    'client data of a get': [
      'client-data',
      (a) => (a.createClientData = (f) => ({ ...f, type: 'webauthn.get' })),
    ],
    'client data of another challenge': [
      'client-data',
      (a) => (a.createClientData = (f) => ({ ...f, challenge: 'A'.repeat(43) })),
    ],
    'client data of another origin': [
      'origin',
      (a) => (a.createClientData = (f) => ({ ...f, origin: 'https://passport.tesx' })),
    ],
    'a cross-origin iframe': [
      'cross-origin',
      (a) => (a.createClientData = (f) => ({ ...f, crossOrigin: true })),
    ],
    'no public key': ['public-key', (a) => (a.createdPublicKey = () => undefined)],
    'a secp256k1 key': [
      'public-key',
      (a) => (a.createdPublicKey = () => k256.publicKey.export({ type: 'spki', format: 'der' })),
    ],
  };
  for (const [name, [reason, change]] of Object.entries(cases)) {
    test(`refuses ${name}`, async () => {
      const { authenticator, webauthn } = fakeAuthenticator();
      change(authenticator);
      authenticator.prfAtCreate = true;
      const prf = { first: new Uint8Array(32).fill(1) };
      const options = { ...site, platform: fakePlatform(webauthn), rpName: 'Passport', user, prf };
      await assert.rejects(createPasskey(options), refusal(reason));
      // A refused create keeps no PRF secret.
      assert.deepEqual(authenticator.createdPrf?.first, new Uint8Array(32));
    });
  }
});

describe('passkeyProvider', () => {
  const enroll = async () => {
    const { authenticator, webauthn } = fakeAuthenticator();
    const platform = fakePlatform(webauthn);
    const { passkey } = await createPasskey({ ...site, platform, rpName: 'Passport', user });
    return { authenticator, provider: passkeyProvider({ ...site, platform, ...passkey }), passkey };
  };
  const challenge = new Uint8Array(32).fill(8);

  test('a create and one signature cost two prompts, with or without GREASE', async () => {
    for (const grease of [false, true]) {
      const { authenticator, provider, passkey } = await enroll();
      authenticator.grease = grease;
      const signed = await provider.sign(challenge);
      assert.ok(signed.scheme === 'p256');
      const policy = webauthnPolicy(site.rpId, site.origin);
      const context = { challenge, publicKey: passkey.publicKey, policy, originLength: 21 };
      const auth = p256AuthArgument(signed, { ...context, useCounter: 0n });
      assert.equal(auth.chrome_grease, grease);
      assert.equal(authenticator.prompts, 2);
    }
  });

  test('refuses a challenge that is not 32 bytes before any prompt', async () => {
    const { authenticator, provider } = await enroll();
    await assert.rejects(provider.sign(new Uint8Array(31)), RangeError);
    assert.equal(authenticator.prompts, 1);
  });

  const cases: Record<string, [string, (a: FakeAuthenticator) => void]> = {
    'a cross-origin assertion': [
      'client-data',
      (a) =>
        (a.getClientData = (json) =>
          Buffer.from(Buffer.from(json).toString('latin1').replace('false', 'true'), 'latin1')),
    ],
    'an assertion with no user verification': ['flags', (a) => (a.flags = 1)],
    'a signature by another key': ['signature', (a) => (a.signingKey = new Uint8Array(32).fill(6))],
  };
  for (const [name, [reason, change]] of Object.entries(cases)) {
    test(`refuses ${name} after one prompt, with no re-prompt`, async () => {
      const { authenticator, provider } = await enroll();
      change(authenticator);
      await assert.rejects(
        provider.sign(challenge),
        (error: unknown) => error instanceof AssertionProfileError && error.reason === reason,
      );
      assert.equal(authenticator.prompts, 2);
    });
  }
});
