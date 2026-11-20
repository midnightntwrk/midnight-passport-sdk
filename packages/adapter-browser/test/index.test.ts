import { test } from 'node:test';
import assert from 'node:assert/strict';

// A server-side render imports the entry, and Node.js has no IndexedDB and no WebAuthn.
test('browserPlatform builds in Node.js, with no WebAuthn there', async () => {
  const { browserPlatform } = await import('@midnight-ntwrk/mn-passport-adapter-browser');
  assert.equal(browserPlatform().webauthn, undefined);
});

test('the esbuild and vite subpaths each give the plugin', async () => {
  const plugins = [
    await import('@midnight-ntwrk/mn-passport-adapter-browser/esbuild'),
    await import('@midnight-ntwrk/mn-passport-adapter-browser/vite'),
  ];
  for (const { passportWasm } of plugins) assert.equal(passportWasm().name, 'mn-passport-wasm');
});
