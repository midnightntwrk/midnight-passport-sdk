import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { jubjub } from '@noble/curves/misc.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import {
  AssertionProfileError,
  checkP256Assertion,
  createSoftwareKeyProvider,
  deviceChallenge,
  envelopeDigest,
  webauthnClientData,
} from '@midnight-ntwrk/mn-passport-core';
import {
  abortedSignal,
  createSoftwareP256Provider,
  expectRejection,
  keyProviderContract,
} from '@midnight-ntwrk/mn-passport-dev';
import { run } from './run.js';

const policy = { rpIdHash: new Uint8Array(32).fill(7), origin: 'https://passport.test' };
const secretKey = new Uint8Array(32).fill(3);
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');
const big = (bytes: Uint8Array) => BigInt(`0x${hex(bytes)}`);
// The contract's generator, read from its own circuit in the pinned build.
const generator = jubjub.Point.fromAffine({
  x: 0x3ea5c4673a121ca35ed37ee3b172f5ee04315c657fbe375f512dfea318d56fe5n,
  y: 0x57137b83ea6edb4f78f7d30d3f616cb3b9aa6e8e40808413c10cea38d50c55cbn,
});

run(
  'software p256 provider',
  keyProviderContract(async () => {
    const provider = createSoftwareP256Provider({ secretKey, policy });
    return {
      provider,
      dismissNextPrompt: () => provider.dismissNextPrompt(),
      hold: () => provider.holdNext(),
    };
  }),
);

// A software key has no prompt and does not wait, so the prompt and in-flight cases do not apply.
const noPrompt = () => {
  throw new Error('a software key has no prompt');
};
for (const scheme of ['k256', 'jubjub'] as const) {
  run(
    `software ${scheme} provider`,
    keyProviderContract(async () => ({
      provider:
        scheme === 'k256'
          ? createSoftwareKeyProvider({ scheme, secretKey })
          : createSoftwareKeyProvider({ scheme, secretKey }),
      dismissNextPrompt: noPrompt,
      hold: noPrompt,
    })).filter((c) => !/abort|dismissed/.test(c.name)),
  );
}

test('a software provider rejects an aborted call with CancelledError', async () => {
  const signal = abortedSignal();
  const k256 = createSoftwareKeyProvider({ scheme: 'k256', secretKey });
  await expectRejection(() => k256.sign(new Uint8Array(32), { signal }), 'CancelledError');
  await expectRejection(() => k256.publicKey({ signal }), 'CancelledError');
  const jubjub = createSoftwareKeyProvider({ scheme: 'jubjub', secretKey });
  const challenge = { authNonce: 0n, bind: () => ({ bytes: new Uint8Array(32), grindNonce: 0n }) };
  await expectRejection(() => jubjub.sign(challenge, { signal }), 'CancelledError');
  await expectRejection(() => jubjub.publicKey({ signal }), 'CancelledError');
});

test('each public key is the point that the contract derives from the secret', async () => {
  // The core vector test checks the manifest of this file.
  const url = new URL('../../core/generated/acc-vectors/keys.json', import.meta.url);
  const file: unknown = JSON.parse(readFileSync(url, 'utf8'));
  assert.ok(typeof file === 'object' && file !== null && 'vectors' in file);
  const vectors: unknown = file.vectors;
  assert.ok(Array.isArray(vectors) && vectors.length === 12);
  for (const v of vectors as unknown[]) {
    assert.ok(typeof v === 'object' && v !== null && 'arm' in v && 'publicKey' in v);
    assert.ok('secretKey' in v && typeof v.secretKey === 'string');
    const key = Buffer.from(v.secretKey.slice(2), 'hex');
    const provider =
      v.arm === 'p256'
        ? createSoftwareP256Provider({ secretKey: key, policy })
        : v.arm === 'jubjub'
          ? createSoftwareKeyProvider({ scheme: 'jubjub', secretKey: key })
          : createSoftwareKeyProvider({ scheme: 'k256', secretKey: key });
    assert.equal(`0x${hex(await provider.publicKey())}`, v.publicKey, String(v.arm));
  }
});

const challengeFor = (arm: 'k256' | 'p256', address: string, publicKey: Uint8Array) =>
  deviceChallenge(
    arm,
    'rotate_enc_key',
    { key: new Uint8Array(32).fill(9) },
    { address, publicKey, authNonce: 4n },
  ).bytes;
const [accountA, accountB] = ['aa'.repeat(32), 'bb'.repeat(32)];

test('a k256 signature for account A is refused for account B with the same nonce', async () => {
  const provider = createSoftwareKeyProvider({ scheme: 'k256', secretKey });
  const publicKey = await provider.publicKey();
  const a = challengeFor('k256', accountA, publicKey);
  const signed = await provider.sign(a);
  assert.ok(signed.scheme === 'k256');
  const { signature } = signed;
  const verifies = (challenge: Uint8Array) =>
    secp256k1.verify(signature, envelopeDigest(0, challenge), Uint8Array.from([4, ...publicKey]), {
      prehash: false,
      lowS: false,
    });
  assert.ok(verifies(a));
  assert.ok(!verifies(challengeFor('k256', accountB, publicKey)));
});

test('a p256 assertion for account A is refused for account B with the same nonce', async () => {
  for (const [flags, chromeGrease] of [
    [5, false],
    [29, true],
  ] as const) {
    const provider = createSoftwareP256Provider({ secretKey, policy, flags, chromeGrease });
    const publicKey = await provider.publicKey();
    const [a, b] = [accountA, accountB].map((address) => challengeFor('p256', address, publicKey));
    assert.ok(a && b);
    const assertion = await provider.sign(a);
    assert.ok(assertion.scheme === 'p256');
    const context = { publicKey, policy, originLength: 21 };
    assert.deepEqual(checkP256Assertion(assertion, { ...context, challenge: a }), { chromeGrease });
    // B's client data with A's signature, so that only the signature can fail.
    const forB = {
      ...assertion,
      clientDataJSON: webauthnClientData(b, policy.origin, chromeGrease),
    };
    assert.throws(
      () => checkP256Assertion(forB, { ...context, challenge: b }),
      (error: unknown) => error instanceof AssertionProfileError && error.reason === 'signature',
    );
  }
});

test('a JubJub signature for account A is refused for account B with the same nonce', async () => {
  const provider = createSoftwareKeyProvider({ scheme: 'jubjub', secretKey });
  const publicKey = await provider.publicKey();
  const challengeOf = (address: string) =>
    deviceChallenge(
      'jubjub',
      'rotate_enc_key',
      { key: new Uint8Array(32).fill(9) },
      {
        address,
        publicKey,
        authNonce: 4n,
      },
    );
  const signed = await provider.sign(challengeOf(accountA));
  assert.ok(signed.scheme === 'jubjub');
  const point = (xy: Uint8Array) =>
    jubjub.Point.fromAffine({ x: big(xy.subarray(0, 32)), y: big(xy.subarray(32)) });
  // The contract's check: s·G == R + c·pk, with c read little-endian.
  const verifies = (address: string) => {
    const c = challengeOf(address).bind(signed.commitment).bytes;
    const right = point(signed.commitment).add(point(publicKey).multiply(big(c.slice().reverse())));
    return generator.multiply(big(signed.response)).equals(right);
  };
  assert.ok(verifies(accountA));
  assert.ok(!verifies(accountB));
  // Two signatures with one R would give away the secret key.
  const again = await provider.sign(challengeOf(accountA));
  assert.ok(again.scheme === 'jubjub');
  assert.notDeepEqual(again.commitment, signed.commitment);
});

test('each provider refuses a secret key that is not a scalar', () => {
  const zero = new Uint8Array(32);
  assert.throws(() => createSoftwareKeyProvider({ scheme: 'jubjub', secretKey: zero }), RangeError);
  assert.throws(() => createSoftwareP256Provider({ secretKey: zero, policy }), RangeError);
  assert.throws(() => createSoftwareKeyProvider({ scheme: 'k256', secretKey: zero }), RangeError);
});
