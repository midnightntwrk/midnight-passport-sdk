import { test } from 'node:test';
import assert from 'node:assert/strict';

test('placeholder', async () => {
  const entry = await import('@midnight-ntwrk/mn-passport-owner');
  assert.deepEqual(Object.keys(entry), []);
});
