import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { deviceChallenge, envelopeDigest } from '@midnight-ntwrk/mn-passport-core';
import { hex, isRecord, loadVectors } from './vectors.js';

test('every vector file comes from the pinned artifact', () => {
  const files = readdirSync(new URL('../generated/acc-vectors/', import.meta.url));
  assert.ok(files.length > 0);
  for (const name of files) loadVectors(name);
});

for (const arm of ['k256', 'p256'] as const) {
  describe(`the ${arm} challenges`, () => {
    test('match the pure circuit on each vector', () => {
      const vectors = loadVectors(`${arm}.json`);
      const name = (v: Record<string, unknown>) => `${String(v.operation)} (${String(v.mode)})`;
      assert.equal(
        new Set(vectors.map(name)).size,
        36,
        'each operation needs min, max, and random',
      );
      for (const v of vectors) {
        const result: unknown = Reflect.apply(deviceChallenge, undefined, [
          arm,
          v.operation,
          v.args,
          v,
        ]);
        assert.ok(isRecord(result));
        assert.equal(hex(result.bytes), hex(v.challenge), name(v));
      }
    });
  });
}

test('the envelope digest matches the pure circuit for both envelopes', () => {
  for (const v of loadVectors('envelope.json')) {
    const digest: unknown = Reflect.apply(envelopeDigest, undefined, [v.envelope, v.challenge]);
    assert.equal(hex(digest), hex(v.digest));
  }
});

describe('a value outside its contract type throws RangeError', () => {
  const context = { address: '00'.repeat(32), publicKey: new Uint8Array(64), authNonce: 0n };
  const coin = { nonce: new Uint8Array(32), color: new Uint8Array(32), value: 0n, mtIndex: 0n };
  const args = { recipient: new Uint8Array(32), color: new Uint8Array(32), amount: 0n, coin };
  const zeros = { phi2: 0n, phi3: 0n, phi4: 0n, phiLength: 0n, wrap: new Uint8Array(64) };
  const recovery = {
    ...zeros,
    recoveryKey: new Uint8Array(64),
    sessionNonce: new Uint8Array(32),
    phi1: 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001n,
  };
  const withdraw =
    (change: Partial<typeof args>, contextChange: Partial<typeof context> = {}) =>
    () =>
      deviceChallenge(
        'k256',
        'withdraw_shielded',
        { ...args, ...change },
        { ...context, ...contextChange },
      );
  // What a plain JS caller can pass, and TypeScript would refuse.
  const untyped =
    (fn: (...args: never[]) => unknown, ...args: unknown[]) =>
    () => {
      Reflect.apply(fn, undefined, args);
    };
  // Each would otherwise hash a value that the caller did not mean, or a truncated one.
  const cases: Record<string, () => unknown> = {
    'amount 2^128': withdraw({ amount: 1n << 128n }),
    'a negative amount': withdraw({ amount: -1n }),
    'mtIndex 2^64': withdraw({ coin: { ...coin, mtIndex: 1n << 64n } }),
    'a 31-byte color': withdraw({ color: new Uint8Array(31) }),
    'an uppercase address': withdraw({}, { address: 'AB'.repeat(32) }),
    'a 65-byte public key': withdraw({}, { publicKey: new Uint8Array(65) }),
    'nonce 2^64': withdraw({}, { authNonce: 1n << 64n }),
    'a Field equal to the modulus': () =>
      deviceChallenge('p256', 'publish_recovery_session', recovery, context),
    'an unknown operation': untyped(deviceChallenge, 'k256', 'toString', {}, context),
    'an unknown arm': untyped(deviceChallenge, 'jubjub', 'recover_cancel', {}, context),
    'a 31-byte challenge': () => envelopeDigest(0, new Uint8Array(31)),
    'envelope 2': untyped(envelopeDigest, 2, new Uint8Array(32)),
  };
  for (const [name, run] of Object.entries(cases)) {
    test(name, () => {
      assert.throws(run, RangeError);
    });
  }
});
