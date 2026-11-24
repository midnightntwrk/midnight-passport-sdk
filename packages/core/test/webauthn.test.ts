import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHash,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';
import { p256 } from '@noble/curves/nist.js';
import {
  AssertionProfileError,
  checkP256Assertion,
  p256AuthArgument,
  p256KeyFromSpki,
  p256SignatureFromDer,
  webauthnClientData,
  webauthnDigest,
  webauthnPolicy,
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

describe('the WebAuthn conversions', () => {
  // Node's own crypto gives an independent SPKI and DER encoder.
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = pair.publicKey.export({ format: 'jwk' });
  const spki = pair.publicKey.export({ type: 'spki', format: 'der' });

  test('reads the key of a P-256 SPKI', () => {
    const xy = Buffer.concat([jwk.x, jwk.y].map((part) => Buffer.from(part ?? '', 'base64url')));
    assert.equal(hex(p256KeyFromSpki(spki)), xy.toString('hex'));
  });

  test('refuses a key of another curve, and a point off the curve', () => {
    const k256 = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
    assert.throws(
      () => p256KeyFromSpki(k256.publicKey.export({ type: 'spki', format: 'der' })),
      RangeError,
    );
    const offCurve = Uint8Array.from(spki, (byte, i) => (i === 90 ? byte ^ 1 : byte));
    assert.throws(() => p256KeyFromSpki(offCurve), RangeError);
  });

  test('gives the r and s of each DER signature, as Node.js reads them', () => {
    const lengths = new Set<number>();
    for (let i = 0; i < 64; i++) {
      const data = Buffer.from([i]);
      const der = cryptoSign('sha256', data, pair.privateKey);
      lengths.add(der.length);
      const raw = p256SignatureFromDer(der);
      const key = { key: pair.publicKey, dsaEncoding: 'ieee-p1363' as const };
      assert.ok(cryptoVerify('sha256', data, key, raw));
    }
    // A 33-byte integer (leading zero) and a short one both occur in 64 signatures.
    assert.ok(Math.max(...lengths) > 70 && Math.min(...lengths) < 71);
  });

  test('keeps a high S', () => {
    const sig = highS(p256.sign(new Uint8Array(32), secretKey, { prehash: false }));
    const der = p256.Signature.fromBytes(sig, 'compact').toBytes('der');
    assert.equal(hex(p256SignatureFromDer(der)), hex(sig));
  });

  const der = cryptoSign('sha256', Buffer.from('x'), pair.privateKey);
  const refused: Record<string, Uint8Array> = {
    'a trailing byte': Uint8Array.from([...der, 0]),
    's = 0': Uint8Array.from([0x30, 6, 2, 1, 1, 2, 1, 0]),
    'a raw signature': new Uint8Array(64),
  };
  for (const [name, input] of Object.entries(refused)) {
    test(`refuses a DER signature with ${name}`, () => {
      assert.throws(
        () => p256SignatureFromDer(input),
        (error: unknown) => error instanceof AssertionProfileError && error.reason === 'signature',
      );
    });
  }
});

describe('p256AuthArgument', () => {
  const grease = assertion({ clientDataJSON: webauthnClientData(challenge, origin, true) });
  const big = (data: Uint8Array) => BigInt(`0x${hex(data)}`);

  test('gives the contract fields of a checked assertion', () => {
    const auth = p256AuthArgument(grease, { ...context, useCounter: 3n });
    assert.deepEqual(auth.pk, {
      x: big(publicKey.subarray(0, 32)),
      y: big(publicKey.subarray(32)),
      identity: false,
    });
    assert.deepEqual(auth.sig, {
      r: big(grease.signature.subarray(0, 32)),
      s: big(grease.signature.subarray(32)),
    });
    assert.equal(auth.chrome_grease, true);
    assert.equal(new TextDecoder().decode(auth.policy.origin), origin);
    assert.equal(auth.use_counter, 3n);
  });

  test('refuses an RP ID that is not ASCII', () => {
    assert.throws(() => webauthnPolicy('pässport.test', origin), RangeError);
  });

  test('refuses a counter outside Uint<64>, and an assertion the check refuses', () => {
    assert.throws(
      () => p256AuthArgument(grease, { ...context, useCounter: 1n << 64n }),
      RangeError,
    );
    const other = { ...context, challenge: new Uint8Array(32), useCounter: 0n };
    assert.throws(() => p256AuthArgument(grease, other), AssertionProfileError);
  });
});
