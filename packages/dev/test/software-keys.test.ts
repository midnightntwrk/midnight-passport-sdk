import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

// The k256 key has no prompt and does not wait, so the prompt and in-flight cases do not apply.
const noPrompt = () => {
  throw new Error('the software k256 provider has no prompt');
};
run(
  'software k256 provider',
  keyProviderContract(async () => ({
    provider: createSoftwareKeyProvider({ scheme: 'k256', secretKey }),
    dismissNextPrompt: noPrompt,
    hold: noPrompt,
  })).filter((c) => !/abort|dismissed/.test(c.name)),
);

test('the software k256 provider rejects an aborted call with CancelledError', async () => {
  const provider = createSoftwareKeyProvider({ scheme: 'k256', secretKey });
  const signal = abortedSignal();
  await expectRejection(() => provider.sign(new Uint8Array(32), { signal }), 'CancelledError');
  await expectRejection(() => provider.publicKey({ signal }), 'CancelledError');
});

test('each public key is the point that the contract derives from the secret', async () => {
  // The core vector test checks the manifest of this file.
  const url = new URL('../../core/generated/acc-vectors/keys.json', import.meta.url);
  const file: unknown = JSON.parse(readFileSync(url, 'utf8'));
  assert.ok(typeof file === 'object' && file !== null && 'vectors' in file);
  const vectors: unknown = file.vectors;
  assert.ok(Array.isArray(vectors) && vectors.length === 8);
  for (const v of vectors as unknown[]) {
    assert.ok(typeof v === 'object' && v !== null && 'arm' in v && 'publicKey' in v);
    assert.ok('secretKey' in v && typeof v.secretKey === 'string');
    const key = Buffer.from(v.secretKey.slice(2), 'hex');
    const provider =
      v.arm === 'p256'
        ? createSoftwareP256Provider({ secretKey: key, policy })
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

test('each provider refuses a secret key that is not a scalar', () => {
  const zero = new Uint8Array(32);
  assert.throws(() => createSoftwareP256Provider({ secretKey: zero, policy }), RangeError);
  assert.throws(() => createSoftwareKeyProvider({ scheme: 'k256', secretKey: zero }), RangeError);
});
