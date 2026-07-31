// The M0 exit's stub wiring: all seven package skeletons load together from
// their built output (roadmap §2 M0; FS-0.1 §2). Loads dist/ paths directly —
// specifier-level resolution through the exports maps is exercised from
// FS-0.3 onward, when packages import one another. Requires `pnpm build`
// first; the `test` script runs it.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const PACKAGES = [
  'protocol',
  'contract',
  'core',
  'connect',
  'adapter-signer-managed',
  'adapter-signer-local',
  'adapter-prover-remote',
];

test('every package skeleton builds and loads (run `pnpm build` first)', async () => {
  for (const pkg of PACKAGES) {
    const entry = new URL(`../packages/${pkg}/dist/index.js`, import.meta.url);
    const mod = await import(entry.href).catch((error) => {
      assert.fail(`"${pkg}" did not load from dist/ — build it first (${error.message})`);
    });
    assert.equal(typeof mod, 'object');
  }
});
