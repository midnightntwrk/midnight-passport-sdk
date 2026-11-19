import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Kernel, SecretHandle } from '../dist/kernel/index.js';
import { zeroize, withSecret, withSecretAsync } from '../dist/kernel/zeroize.js';

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
    const length = await withSecretAsync(buffer, async (secret) => secret.length);
    assert.equal(length, 4);
    assert.deepEqual([...buffer], [0, 0, 0, 0]);
  }

  {
    const buffer = Uint8Array.from([1, 2, 3, 4]);
    await assert.rejects(
      withSecretAsync(buffer, async () => {
        throw new Error('boom');
      }),
      /boom/,
    );
    assert.deepEqual([...buffer], [0, 0, 0, 0], 'withSecretAsync zeros on a reject');
  }

  kernel.dispose();
});

test('releaseSecret invalidates the handle and rejects a stale handle', () => {
  const kernel = new Kernel();
  const handle = kernel.holdSecret(Uint8Array.from([9, 9, 9, 9]));

  kernel.releaseSecret(handle);
  assert.throws(() => kernel.releaseSecret(handle), /already released or was not issued/);

  kernel.dispose();
});

test('dispose invalidates every handle the kernel still holds', () => {
  const kernel = new Kernel();
  const first = kernel.holdSecret(Uint8Array.from([1, 1, 1]));
  const second = kernel.holdSecret(Uint8Array.from([2, 2, 2]));

  kernel.dispose();

  assert.throws(() => kernel.releaseSecret(first), /already released or was not issued/);
  assert.throws(() => kernel.releaseSecret(second), /already released or was not issued/);
});

test('a secret handled by one kernel is unknown to another', () => {
  const first = new Kernel();
  const second = new Kernel();
  const handle = first.holdSecret(Uint8Array.from([3, 3, 3]));

  assert.throws(() => second.releaseSecret(handle), /already released or was not issued/);

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
