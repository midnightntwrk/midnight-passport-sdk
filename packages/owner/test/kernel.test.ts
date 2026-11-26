import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { InboxKeyError, openInboxEntry, sealInboxEntry } from '@midnight-ntwrk/mn-passport-core';

import { Kernel, SecretHandle } from '../dist/kernel/index.js';
import { zeroize, withSecret } from '../dist/kernel/zeroize.js';

test('every kernel function that takes a secret buffer zeros it after use', async () => {
  const kernel = new Kernel();

  {
    const buffer = Uint8Array.from([1, 2, 3, 4]);
    zeroize(buffer);
    assert.deepEqual([...buffer], [0, 0, 0, 0]);
  }

  {
    const buffer = Uint8Array.from([1, 2, 3, 4]);
    const handle = kernel.holdSecret(buffer);
    assert.deepEqual([...buffer], [0, 0, 0, 0], 'holdSecret zeros the caller buffer');
    kernel.releaseSecret(handle);
  }

  {
    const buffer = Uint8Array.from([1, 2, 3, 4]);
    const length = withSecret(buffer, (secret) => secret.length);
    assert.equal(length, 4);
    assert.deepEqual([...buffer], [0, 0, 0, 0]);
  }

  {
    const buffer = Uint8Array.from([1, 2, 3, 4]);
    assert.throws(
      () =>
        withSecret(buffer, () => {
          throw new Error('boom');
        }),
      /boom/,
    );
    assert.deepEqual([...buffer], [0, 0, 0, 0], 'withSecret zeros on a throw');
  }

  {
    const buffer = Uint8Array.from([1, 2, 3, 4]);
    const first = await withSecret(buffer, async (secret) => {
      await Promise.resolve();
      return secret[0];
    });
    assert.equal(first, 1, 'an async callback still reads the secret after an await');
    assert.deepEqual([...buffer], [0, 0, 0, 0]);
  }

  {
    const buffer = Uint8Array.from([1, 2, 3, 4]);
    await assert.rejects(
      withSecret(buffer, async () => {
        throw new Error('boom');
      }),
      /boom/,
    );
    assert.deepEqual([...buffer], [0, 0, 0, 0], 'withSecret zeros on a reject');
  }

  kernel.dispose();
});

test('the kept copy shares no memory with the caller buffer', () => {
  const kernel = new Kernel();
  // A Node.js Buffer, whose `slice` gives a view and not a copy.
  const buffer = Buffer.from([1, 2, 3]);
  const handle = kernel.holdSecret(buffer);
  buffer.set([7, 8, 9]);

  kernel.releaseSecret(handle);
  assert.deepEqual([...buffer], [7, 8, 9], 'releaseSecret must not zero the caller buffer');

  kernel.dispose();
});

test('releaseSecret invalidates the handle and rejects a stale handle', () => {
  const kernel = new Kernel();
  const handle = kernel.holdSecret(Uint8Array.from([9, 9, 9, 9]));

  kernel.releaseSecret(handle);
  assert.throws(() => kernel.releaseSecret(handle), { code: 'UNKNOWN_HANDLE' });

  kernel.dispose();
});

test('dispose invalidates every handle the kernel still holds', () => {
  const kernel = new Kernel();
  const first = kernel.holdSecret(Uint8Array.from([1, 1, 1]));
  const second = kernel.holdSecret(Uint8Array.from([2, 2, 2]));

  kernel.dispose();

  assert.throws(() => kernel.releaseSecret(first), { code: 'UNKNOWN_HANDLE' });
  assert.throws(() => kernel.releaseSecret(second), { code: 'UNKNOWN_HANDLE' });
});

test('a secret handled by one kernel is unknown to another', () => {
  const first = new Kernel();
  const second = new Kernel();
  const handle = first.holdSecret(Uint8Array.from([3, 3, 3]));

  assert.throws(() => second.releaseSecret(handle), { code: 'UNKNOWN_HANDLE' });

  first.releaseSecret(handle);
  first.dispose();
  second.dispose();
});

test('a handle carries no secret bytes', () => {
  const kernel = new Kernel();
  const handle = kernel.holdSecret(Uint8Array.from([5, 5, 5]));

  assert.ok(handle instanceof SecretHandle);
  assert.ok(!(handle instanceof Uint8Array), 'a handle is not a buffer');
  assert.deepEqual(Object.keys(handle), [], 'a handle exposes no own property');
  assert.equal(JSON.stringify(handle), '{}', 'a handle serializes without bytes');

  kernel.releaseSecret(handle);
  kernel.dispose();
});

test('the inbox key opens an entry sealed to the held secret, until the release', async () => {
  const pair = generateKeyPairSync('x25519');
  const last32 = (der: Buffer) => new Uint8Array(der.subarray(der.length - 32));
  const secret = last32(pair.privateKey.export({ format: 'der', type: 'pkcs8' }));
  const coin = { nonce: new Uint8Array(32).fill(1), color: new Uint8Array(32).fill(2), value: 9n };
  const entry = await sealInboxEntry(
    last32(pair.publicKey.export({ format: 'der', type: 'spki' })),
    coin,
  );
  const kernel = new Kernel();
  const handle = kernel.holdSecret(secret);
  const key = kernel.inboxKey(handle);

  assert.deepEqual(await openInboxEntry(entry, key), coin);
  assert.deepEqual(await openInboxEntry(entry, key), coin, 'the held copy is not zeroed by a use');

  kernel.releaseSecret(handle);
  await assert.rejects(openInboxEntry(entry, key), InboxKeyError);
  assert.throws(() => kernel.inboxKey(handle), { code: 'UNKNOWN_HANDLE' });
  kernel.dispose();
});
