// Guards the workspace shape: pnpm workspaces, the Node 22 baseline (the CI
// gate), and exact-pinned dependencies with a committed lockfile
// (docs/development-workflow.md, deps).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { BUNDLED } from '../scripts/bundle-packages.mjs';
import { parseJson } from '../scripts/json.mjs';

/** @param {string} path */
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
/**
 * @typedef {{ dependencies?: Record<string, string>, devDependencies?: Record<string, string>, peerDependencies?: Record<string, string> }} Pins
 * @typedef {Pins & { private?: unknown, workspaces?: unknown, packageManager: string, engines?: { node?: unknown } }} RootManifest
 */
const root = /** @type {RootManifest} */ (parseJson(await read('../package.json')));

test('the repo is a private pnpm workspace over packages/*', async () => {
  assert.equal(root.private, true);
  assert.equal(root.workspaces, undefined, 'workspaces are pnpm-workspace.yaml’s, not npm’s');
  assert.match(root.packageManager, /^pnpm@\d+\.\d+\.\d+$/, 'packageManager must pin pnpm exactly');
  const workspace = await read('../pnpm-workspace.yaml');
  assert.match(workspace, /^packages:\n {2}- packages\/\*$/m);
});

test('the Node baseline agrees across manifest, .nvmrc, and the CI gate', async () => {
  assert.ok(root.engines, 'root manifest must declare engines');
  // The tests use `module.registerHooks`, which came in 22.15.
  assert.equal(root.engines.node, '>=22.15');
  assert.equal((await read('../.nvmrc')).trim(), '22');
  const workflow = await read('../.github/workflows/pr-checks.yml');
  const pins = [...workflow.matchAll(/node-version(?:-file)?:\s*(.+)/g)].map((m) =>
    String(m[1]).trim(),
  );
  assert.ok(pins.length > 0, 'the CI gate must pin its Node version');
  for (const pin of pins) {
    assert.ok(
      pin === '22' || pin.includes('.nvmrc'),
      `CI node-version must be 22 or driven by .nvmrc, got "${pin}"`,
    );
  }
});

test('every dependency in every workspace manifest is exact-pinned', async () => {
  /** @type {[string, Pins][]} */
  const manifests = [['package.json', root]];
  const packages = await readdir(new URL('../packages', import.meta.url)).catch(() => []);
  for (const dir of packages) {
    const path = `../packages/${dir}/package.json`;
    manifests.push([path, /** @type {Pins} */ (parseJson(await read(path)))]);
  }
  for (const [path, manifest] of manifests) {
    const all = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
    };
    for (const [name, version] of Object.entries(all)) {
      if (version.startsWith('workspace:') || version === '*') continue; // workspace links
      assert.match(
        version,
        /^\d+\.\d+\.\d+$/,
        `${path}: ${name} must be an exact pin, got "${version}"`,
      );
    }
  }
});

const packageDirs = (await readdir(new URL('../packages', import.meta.url))).sort();

// The browser adapter also ships its bundler plugins. Every other package has one entry.
/** @type {Record<string, string[]>} */
const SUBPATHS = { 'adapter-browser': ['esbuild', 'vite'] };

test('package shape', async () => {
  assert.ok(packageDirs.length > 0, 'packages/ must hold the scaffolded packages');
  for (const dir of packageDirs) {
    const manifest =
      /** @type {{ type?: string, sideEffects?: boolean, exports?: unknown, files?: string[], private?: boolean }} */ (
        parseJson(await read(`../packages/${dir}/package.json`))
      );
    assert.equal(manifest.type, 'module', `${dir}: type`);
    assert.equal(manifest.sideEffects, false, `${dir}: sideEffects`);
    assert.deepEqual(
      manifest.exports,
      Object.fromEntries(
        ['index', ...(SUBPATHS[dir] ?? [])].map((name) => [
          name === 'index' ? '.' : `./${name}`,
          { types: `./dist/${name}.d.ts`, default: `./dist/${name}.js` },
        ]),
      ),
      `${dir}: the "." entry, and the listed subpaths`,
    );
    // The bundle test checks what a bundled package ships.
    if (!BUNDLED.includes(`packages/${dir}`)) {
      assert.deepEqual(
        manifest.files,
        ['dist', '!dist/.tsbuildinfo'],
        `${dir}: only the build ships`,
      );
    }
    const tests = await readdir(new URL(`../packages/${dir}/test`, import.meta.url));
    assert.ok(
      tests.some((file) => file.endsWith('.test.ts')),
      `${dir}: a test under test/`,
    );
    assert.equal(manifest.private, dir === 'dev' ? true : undefined, `${dir}: private flag`);
  }
});

test('the root build references every package', async () => {
  const solution = /** @type {{ references: { path: string }[] }} */ (
    parseJson(await read('../tsconfig.build.json'))
  );
  const built = solution.references.map((ref) => ref.path);
  assert.deepEqual(
    built.sort(),
    packageDirs.map((dir) => `packages/${dir}/tsconfig.test.json`),
  );
});
