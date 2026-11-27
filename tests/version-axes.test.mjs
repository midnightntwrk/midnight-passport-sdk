import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';

/** @typedef {import('../packages/protocol/dist/index.js').ProtocolVersion} ProtocolVersion */
/** @typedef {import('../packages/contract/dist/index.js').BindingVersion} BindingVersion */

/** @type {(version: ProtocolVersion) => void} */
const wantsWireVersion = () => {};
/** @type {(version: BindingVersion) => void} */
const wantsBindingVersion = () => {};

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Nothing calls this function. The compiler checks it.
function _axesAreDisjoint() {
  /** @type {ProtocolVersion} */
  const wire = { major: 2, minor: 0 };
  /** @type {BindingVersion} */
  const binding = { compiler: '', manifestHash: '', originLength: 0 };

  // @ts-expect-error a binding version is not a wire version
  wantsWireVersion(binding);
  // @ts-expect-error a wire version is not a binding version
  wantsBindingVersion(wire);
}

test('PROTOCOL_VERSION is exported from protocol only', async () => {
  const packages = await readdir(new URL('../packages', import.meta.url));
  /** @type {string[]} */
  const exporters = [];
  for (const dir of packages.sort()) {
    /** @type {unknown} */
    let entry;
    try {
      entry = await import(new URL(`../packages/${dir}/dist/index.js`, import.meta.url).href);
    } catch {
      continue;
    }
    if (typeof entry === 'object' && entry !== null && 'PROTOCOL_VERSION' in entry)
      exporters.push(dir);
  }
  assert.deepEqual(exporters, ['protocol']);
});
