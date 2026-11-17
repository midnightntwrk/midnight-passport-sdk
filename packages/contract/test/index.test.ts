import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BindingVersion } from '@midnight-ntwrk/mn-passport-contract';

test('BindingVersion names one ACC build', () => {
  const sample: BindingVersion = {
    compiler: '0.0.0',
    manifestHash: '',
    originLength: 0,
  };
  assert.equal(typeof sample.compiler, 'string');
  assert.equal(typeof sample.manifestHash, 'string');
  assert.equal(typeof sample.originLength, 'number');
});

test('the contract entry has no run-time export yet', async () => {
  const entry = await import('@midnight-ntwrk/mn-passport-contract');
  assert.deepEqual(Object.keys(entry), []);
});
