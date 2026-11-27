import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromHex, toHex } from '@midnight-ntwrk/mn-passport-core';

test('fromHex refuses what is not even-length hex, and round-trips with toHex', () => {
  for (const bad of ['0', 'zz', '0x00', '0 ', 'ab-c']) assert.equal(fromHex(bad), undefined, bad);
  assert.deepEqual(fromHex('00fFa1'), Uint8Array.of(0, 255, 161));
  assert.equal(toHex(Uint8Array.of(0, 255, 161)), '00ffa1');
});
