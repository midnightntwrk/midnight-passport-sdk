import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { p256 } from '@noble/curves/nist.js';
import {
  AssertionProfileError,
  checkP256Assertion,
  webauthnClientData,
  webauthnDigest,
  type AssertionProfileReason,
  type P256Assertion,
} from '@midnight-ntwrk/mn-passport-core';
import { hex, loadVectors } from './vectors.js';

const ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const origin = 'https://passport.test';
const policy = { rpIdHash: new Uint8Array(32).fill(7), origin };
const challenge = Uint8Array.from({ length: 32 }, (_, i) => i);
const secretKey = new Uint8Array(32).fill(3);
const publicKey = p256.getPublicKey(secretKey, false).slice(1);
const context = { challenge, publicKey, policy, originLength: origin.length };

const be32 = (value: bigint): number[] => [
  ...Buffer.from(value.toString(16).padStart(64, '0'), 'hex'),
];
const signature = (r: bigint, s: bigint) => Uint8Array.from([...be32(r), ...be32(s)]);
const sign = (authenticatorData: Uint8Array, clientDataJSON: Uint8Array, key = secretKey) =>
  authenticatorData.length === 37
    ? p256.sign(webauthnDigest(authenticatorData, clientDataJSON), key, { prehash: false })
    : new Uint8Array(64);
const authData = (flags: number) => Uint8Array.from([...policy.rpIdHash, flags, 0, 0, 0, 9]);
const assertion = (change: Partial<P256Assertion> = {}): P256Assertion => {
  const authenticatorData = change.authenticatorData ?? authData(5);
  const clientDataJSON = change.clientDataJSON ?? webauthnClientData(challenge, origin, false);
  const sig = change.signature ?? sign(authenticatorData, clientDataJSON);
  return { scheme: 'p256', authenticatorData, clientDataJSON, signature: sig };
};
const highS = (sig: Uint8Array): Uint8Array => {
  const [r, s] = [sig.subarray(0, 32), sig.subarray(32)].map((half) => BigInt(`0x${hex(half)}`));
  return r === undefined || s === undefined || s > ORDER / 2n ? sig : signature(r, ORDER - s);
};

describe('checkP256Assertion', () => {
  test('accepts both shapes and says which one the contract must rebuild', () => {
    assert.deepEqual(checkP256Assertion(assertion(), context), { chromeGrease: false });
    const grease = assertion({ clientDataJSON: webauthnClientData(challenge, origin, true) });
    assert.deepEqual(checkP256Assertion(grease, context), { chromeGrease: true });
  });

  test('accepts the flags with backup eligible and backed up, and a high S', () => {
    for (const flags of [13, 29]) {
      checkP256Assertion(assertion({ authenticatorData: authData(flags) }), context);
    }
    checkP256Assertion(assertion({ signature: highS(assertion().signature) }), context);
  });

  const other = Uint8Array.from(challenge, (byte, i) => (i === 31 ? byte ^ 1 : byte));
  const plain = new TextDecoder().decode(webauthnClientData(challenge, origin, false));
  const withOrigin = (bad: string) => ({ ...context, policy: { ...policy, origin: bad } });
  const cases: Record<string, [AssertionProfileReason, P256Assertion, typeof context?]> = {
    'a 20-byte origin': ['origin', assertion(), { ...context, originLength: 20 }],
    'a quote in the origin': ['origin', assertion(), withOrigin('https://passport.tes"')],
    'a backslash in the origin': ['origin', assertion(), withOrigin('https://passport.tes\\')],
    'the client data of another challenge': [
      'client-data',
      assertion({ clientDataJSON: webauthnClientData(other, origin, false) }),
    ],
    'a cross-origin assertion': [
      'client-data',
      assertion({ clientDataJSON: Buffer.from(plain.replace('false', 'true'), 'latin1') }),
    ],
    'padded authenticator data': [
      'authenticator-data',
      assertion({ authenticatorData: Uint8Array.from([...authData(5), 0]) }),
    ],
    'another RP': [
      'rp-id-hash',
      assertion({
        authenticatorData: Uint8Array.from(authData(5), (b, i) => (i === 0 ? b ^ 1 : b)),
      }),
    ],
    'user present only': ['flags', assertion({ authenticatorData: authData(1) })],
    'backed up and not backup eligible': ['flags', assertion({ authenticatorData: authData(21) })],
    'attested credential data': ['flags', assertion({ authenticatorData: authData(69) })],
    'r = 0': ['signature', assertion({ signature: signature(0n, 1n) })],
    's = n': ['signature', assertion({ signature: signature(1n, ORDER) })],
    'a DER signature': ['signature', assertion({ signature: new Uint8Array(70) })],
    'a signature by another key': [
      'signature',
      assertion({
        signature: sign(authData(5), assertion().clientDataJSON, new Uint8Array(32).fill(4)),
      }),
    ],
  };
  for (const [name, [reason, input, ctx = context]] of Object.entries(cases)) {
    test(`refuses ${name}`, () => {
      assert.throws(
        () => checkP256Assertion(input, ctx),
        (error: unknown) => error instanceof AssertionProfileError && error.reason === reason,
      );
    });
  }
});

test('both client data shapes match the contract on each vector', () => {
  for (const v of loadVectors('webauthn.json')) {
    assert.ok(v.challenge instanceof Uint8Array && typeof v.origin === 'string');
    const json = webauthnClientData(v.challenge, v.origin, false);
    const grease = webauthnClientData(v.challenge, v.origin, true);
    assert.equal(hex(json.subarray(36, 79)), hex(v.base64));
    assert.equal(createHash('sha256').update(json).digest('hex'), hex(v.clientDataHash));
    assert.equal(createHash('sha256').update(grease).digest('hex'), hex(v.greaseHash));
  }
});
