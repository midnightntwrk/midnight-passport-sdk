import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BUNDLED, bundle } from '../scripts/bundle-packages.mjs';
import { parseJson } from '../scripts/json.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const INLINED = /[\\/]effect@4\.\d+\.\d+[\\/]/;
const BANNER = /Includes effect .* MIT License/;
const EFFECT_IMPORT = /\bfrom\s*["']effect[/"']|\bimport\(\s*["']effect[/"']/;

/** @param {string} dir @returns {string[]} */
const packed = (dir) => {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: join(root, dir),
    encoding: 'utf8',
    // A sync call blocks the test timeout.
    timeout: 60_000,
  });
  // npm 10 prints an array, npm 11 an object keyed by package name.
  const [{ files }] = /** @type {[{ files: { path: string }[] }]} */ (
    Object.values(/** @type {Record<string, unknown>} */ (parseJson(out)))
  );
  return files.map((/** @type {{ path: string }} */ f) => f.path);
};

for (const dir of BUNDLED) {
  test(`${dir} does not list effect, and ships only its bundle and types`, () => {
    const manifest =
      /** @type {{ dependencies?: Record<string, string>, peerDependencies?: Record<string, string> }} */ (
        parseJson(readFileSync(join(root, dir, 'package.json'), 'utf8'))
      );
    assert.equal(manifest.dependencies?.effect, undefined);
    assert.equal(manifest.peerDependencies?.effect, undefined);
    const files = packed(dir);
    assert.deepEqual(files.filter((f) => !/^dist\/.*\.d\.ts$/.test(f)).sort(), [
      'dist/index.js',
      'dist/index.js.map',
      'package.json',
    ]);
    const entry = readFileSync(join(root, dir, 'dist/index.js'), 'utf8');
    // tsc's entry imports its sibling files; the bundle has none of them.
    assert.doesNotMatch(entry, /\bfrom\s*["']\.\.?\//);
    assert.doesNotMatch(entry, EFFECT_IMPORT);
    // Effect's license notice goes on a bundle exactly when it inlines Effect code.
    assert.equal(BANNER.test(entry), INLINED.test(entry), 'the license banner');
  });
}

// No core export uses Effect yet, so the probe is what shows Effect 4 inlined.
test(
  'a bundled entry inlines Effect 4 and runs both adapter calls',
  { timeout: 30_000 },
  async () => {
    const dir = 'tests/fixtures/consumer-probe';
    await bundle(dir);
    const entry = join(root, dir, 'dist/index.js');
    const code = readFileSync(entry, 'utf8');
    assert.match(code, INLINED);
    assert.match(code, BANNER);
    assert.doesNotMatch(code, EFFECT_IMPORT);
    /** @type {unknown} */
    const loaded = await import(pathToFileURL(entry).href);
    const { probe } = /** @type {{ probe: () => Promise<string> }} */ (loaded);
    assert.equal(await probe(), 'promise v3');
  },
);
