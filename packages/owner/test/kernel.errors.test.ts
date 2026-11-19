import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';

import { PassportError } from '@midnight-ntwrk/mn-passport-core';
import { Kernel, SecretHandle, UnknownHandleError } from '../dist/kernel/index.js';

// Distinctive bytes, so a leak is unmistakable.
const SECRET = Uint8Array.from([222, 173, 190, 239, 12, 34, 56, 78]);

// Every textual view through which an error can leak.
const viewsOf = (error: unknown): string[] => [
  String(error),
  JSON.stringify(error),
  inspect(error, { showHidden: true, depth: null }),
  ...Object.getOwnPropertyNames(error).map((key) => String(Reflect.get(error as object, key))),
];

// A Uint8Array renders as a decimal list, an index map, or hex.
const strip = (text: string): string => text.replace(/\s/g, '');
const asDecimals = strip([...SECRET].join(','));
const asIndexMap = strip([...SECRET].map((byte, index) => `"${index}":${byte}`).join(','));
const asHex = Buffer.from(SECRET).toString('hex');
const reveals = (view: string): boolean => {
  const packed = strip(view);
  return packed.includes(asDecimals) || packed.includes(asIndexMap) || packed.includes(asHex);
};

test('the leak detector catches an error that carries the secret', () => {
  class LeakyError extends PassportError {
    readonly _tag = 'LeakyError';
    readonly code = 'LEAK';
    constructor(secret: Uint8Array) {
      super(`leaked ${String(secret)}`);
      this.name = 'LeakyError';
      Object.defineProperty(this, 'secret', { value: secret, enumerable: false });
    }
  }
  assert.ok(viewsOf(new LeakyError(SECRET.slice())).some(reveals));
});

test('a kernel error reveals no held secret, in any view', () => {
  const kernel = new Kernel();
  kernel.holdSecret(SECRET.slice());
  const stale = new SecretHandle();

  let caught: unknown;
  try {
    kernel.releaseSecret(stale);
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof UnknownHandleError);
  assert.ok(caught instanceof PassportError);
  for (const view of viewsOf(caught)) assert.ok(!reveals(view));
  kernel.dispose();
});
