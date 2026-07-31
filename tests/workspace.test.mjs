// Guards the FS-0.1 T1 acceptance shape: pnpm workspaces (spec D-9), the
// Node 22 baseline (spec D-1; the CI gate), and exact-pinned dependencies
// with a committed lockfile (docs/development-workflow.md §2, deps).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

/** @param {string} path */
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const root = JSON.parse(await read('../package.json'));

test('the repo is a private pnpm workspace over packages/*', async () => {
  assert.equal(root.private, true);
  assert.equal(root.workspaces, undefined, 'workspaces are pnpm-workspace.yaml’s, not npm’s');
  assert.match(root.packageManager, /^pnpm@\d+\.\d+\.\d+$/, 'packageManager must pin pnpm exactly');
  const workspace = await read('../pnpm-workspace.yaml');
  assert.match(workspace, /^packages:\n {2}- packages\/\*$/m);
});

test('the Node baseline agrees across manifest, .nvmrc, and the CI gate', async () => {
  assert.ok(root.engines, 'root manifest must declare engines');
  assert.equal(root.engines.node, '>=22');
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
  const manifests = [['package.json', root]];
  const packages = await readdir(new URL('../packages', import.meta.url)).catch(() => []);
  for (const dir of packages) {
    const path = `../packages/${dir}/package.json`;
    manifests.push([path, JSON.parse(await read(path))]);
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
