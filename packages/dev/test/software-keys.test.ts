import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { p256 } from '@noble/curves/nist.js';
import {
  checkP256Assertion,
  deviceChallenge,
  webauthnClientData,
  webauthnDigest,
} from '@midnight-ntwrk/mn-passport-core';
import { createSoftwareP256Provider, keyProviderContract } from '@midnight-ntwrk/mn-passport-dev';
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

test('the p256 public key is the point that the contract derives from the secret', async () => {
  // The core vector test checks the manifest of this file.
  const url = new URL('../../core/generated/acc-vectors/keys.json', import.meta.url);
  const file: unknown = JSON.parse(readFileSync(url, 'utf8'));
  assert.ok(typeof file === 'object' && file !== null && 'vectors' in file);
  const vectors: unknown = file.vectors;
  assert.ok(Array.isArray(vectors));
  for (const v of vectors as unknown[]) {
    assert.ok(typeof v === 'object' && v !== null && 'arm' in v && 'publicKey' in v);
    assert.ok('secretKey' in v && typeof v.secretKey === 'string');
    if (v.arm !== 'p256') continue;
    const provider = createSoftwareP256Provider({
      secretKey: Buffer.from(v.secretKey.slice(2), 'hex'),
      policy,
    });
    assert.equal(`0x${hex(await provider.publicKey())}`, v.publicKey);
  }
});

test('a p256 assertion for account A is refused for account B with the same nonce', async () => {
  for (const [flags, chromeGrease] of [
    [5, false],
    [29, true],
  ] as const) {
    const provider = createSoftwareP256Provider({ secretKey, policy, flags, chromeGrease });
    const publicKey = await provider.publicKey();
    const challengeOf = (address: string) =>
      deviceChallenge(
        'p256',
        'rotate_enc_key',
        { key: new Uint8Array(32).fill(9) },
        {
          address,
          publicKey,
          authNonce: 4n,
        },
      ).bytes;
    const [a, b] = [challengeOf('aa'.repeat(32)), challengeOf('bb'.repeat(32))];
    const assertion = await provider.sign(a);
    assert.ok(assertion.scheme === 'p256');
    const context = { publicKey, policy, originLength: 21 };
    assert.deepEqual(checkP256Assertion(assertion, { ...context, challenge: a }), { chromeGrease });
    const verifies = (challenge: Uint8Array) =>
      p256.verify(
        assertion.signature,
        webauthnDigest(
          assertion.authenticatorData,
          webauthnClientData(challenge, policy.origin, chromeGrease),
        ),
        Uint8Array.from([4, ...publicKey]),
        { prehash: false, lowS: false },
      );
    assert.ok(verifies(a));
    assert.ok(!verifies(b));
  }
});

test('the p256 provider refuses a secret key that is not a scalar', () => {
  assert.throws(
    () => createSoftwareP256Provider({ secretKey: new Uint8Array(32), policy }),
    RangeError,
  );
});
