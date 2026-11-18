import { test } from 'node:test';
import assert from 'node:assert/strict';

test('the entry imports in Node.js and exports nothing yet', async () => {
  const entry = await import('@midnight-ntwrk/mn-passport-adapter-browser');
  assert.deepEqual(Object.keys(entry), []);
});

test('the esbuild subpath gives the plugin', async () => {
  const { passportWasm } = await import('@midnight-ntwrk/mn-passport-adapter-browser/esbuild');
  assert.equal(passportWasm().name, 'mn-passport-wasm');
});
