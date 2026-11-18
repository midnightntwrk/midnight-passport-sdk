import { test } from 'node:test';
import assert from 'node:assert/strict';

// A server-side render imports the entry, and Node.js has no IndexedDB.
test('browserPlatform builds in Node.js', async () => {
  const { browserPlatform } = await import('@midnight-ntwrk/mn-passport-adapter-browser');
  assert.doesNotThrow(() => browserPlatform());
});

test('the esbuild subpath gives the plugin', async () => {
  const { passportWasm } = await import('@midnight-ntwrk/mn-passport-adapter-browser/esbuild');
  assert.equal(passportWasm().name, 'mn-passport-wasm');
});
