import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodePlatform } from '@midnight-ntwrk/mn-passport-adapter-nodejs';

// An empty path resolves to the working folder, and the store would write there.
test('an empty storeDir is refused', () => {
  assert.throws(() => nodePlatform({ storeDir: '' }), TypeError);
});
