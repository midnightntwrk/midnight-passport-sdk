// Manifest- and tsconfig-level assertion of the architecture §4.4 dependency
// graph (FS-0.1 D-2/D-3): every @midnight-ntwrk/mn-passport-* edge in a
// workspace manifest or a project reference must be permitted, and `connect`
// must have no path to `core` or any adapter — not even transitively. The
// import-level twin is scripts/lint-boundaries.mjs; both consume
// scripts/dependency-graph.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { ALLOWED, SCOPE } from '../scripts/dependency-graph.mjs';

/** @param {string} path */
const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

const dirs = (await readdir(new URL('../packages', import.meta.url))).sort();
/** @type {Map<string, string[]>} */
const edges = new Map();
/** @type {Map<string, string[]>} */
const references = new Map();
for (const dir of dirs) {
  const manifest = await readJson(`../packages/${dir}/package.json`);
  const deps = Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
  })
    .filter((name) => name.startsWith(SCOPE))
    .map((name) => name.slice(SCOPE.length));
  edges.set(dir, deps);

  const tsconfig = await readJson(`../packages/${dir}/tsconfig.json`);
  references.set(
    dir,
    (tsconfig.references ?? []).map((/** @type {{path: string}} */ ref) =>
      ref.path.replace(/^\.\.\//, ''),
    ),
  );
}

test('all expected packages are scaffolded', () => {
  assert.deepEqual(dirs, Object.keys(ALLOWED).sort());
});

test('every workspace dependency edge is in the architecture §4.4 graph', () => {
  for (const [pkg, deps] of edges) {
    const allowed = ALLOWED[pkg];
    assert.ok(allowed, `unexpected package "${pkg}" — add it to the graph deliberately`);
    for (const dep of deps) {
      assert.ok(allowed.includes(dep), `"${pkg}" must not depend on "${dep}" (architecture §4.4)`);
    }
  }
});

test('every tsconfig project reference mirrors a permitted edge', () => {
  for (const [pkg, refs] of references) {
    const allowed = ALLOWED[pkg] ?? [];
    assert.deepEqual(
      [...refs].sort(),
      [...allowed].sort(),
      `"${pkg}" tsconfig references must mirror its permitted dependencies (architecture §4.4)`,
    );
  }
});

test('connect has no path to core or any adapter, even transitively', () => {
  const reachable = new Set();
  const walk = (/** @type {string} */ pkg) => {
    for (const dep of edges.get(pkg) ?? []) {
      if (!reachable.has(dep)) {
        reachable.add(dep);
        walk(dep);
      }
    }
  };
  walk('connect');
  for (const target of reachable) {
    assert.ok(
      target !== 'core' && !target.startsWith('adapter-'),
      `connect reaches "${target}" — the kernel must never enter a dApp bundle (architecture §4.4)`,
    );
  }
});

test('every package skeleton is private, pre-release, and ESM', async () => {
  for (const dir of dirs) {
    const manifest = await readJson(`../packages/${dir}/package.json`);
    assert.equal(manifest.name, SCOPE + dir);
    assert.equal(
      manifest.private,
      true,
      `"${dir}" must stay private until the release skill exists`,
    );
    assert.equal(manifest.version, '0.0.0');
    assert.equal(manifest.type, 'module');
  }
});
