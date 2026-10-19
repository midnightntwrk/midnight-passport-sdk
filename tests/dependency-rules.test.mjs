// Guards the dependency rules (docs/architecture.md, "Dependency rules") at
// the manifest and project-reference level. The workspace is empty after the
// reset, so the fixtures prove that the check still rejects forbidden edges
// once packages are added.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWED, NEVER_REACHES, SCOPE } from '../scripts/dependency-graph.mjs';
import { checkWorkspace, reachable } from '../scripts/dependency-rules.mjs';

/** @type {string[]} */
const fixtures = [];
after(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
});

/**
 * Writes a fixture workspace: each package lists its SDK dependencies, and
 * its project references (by default the same packages).
 * @param {Record<string, { deps?: string[], refs?: string[], name?: string }>} packages
 * @returns {string}
 */
function workspace(packages) {
  const root = mkdtempSync(join(tmpdir(), 'mn-passport-deps-'));
  fixtures.push(root);
  for (const [dir, { deps = [], refs = deps, name = SCOPE + dir }] of Object.entries(packages)) {
    mkdirSync(join(root, 'packages', dir), { recursive: true });
    const dependencies = Object.fromEntries(deps.map((dep) => [SCOPE + dep, 'workspace:*']));
    writeFileSync(
      join(root, 'packages', dir, 'package.json'),
      JSON.stringify({ name, dependencies }),
    );
    const references = refs.map((ref) => ({ path: `../${ref}` }));
    writeFileSync(join(root, 'packages', dir, 'tsconfig.json'), JSON.stringify({ references }));
  }
  return root;
}

test('the repository workspace respects the dependency rules', () => {
  assert.deepEqual(checkWorkspace(fileURLToPath(new URL('..', import.meta.url))), []);
});

test('the graph itself keeps connect, agent, and ecosystems away from forbidden packages', () => {
  const edges = new Map(Object.entries(ALLOWED).map(([pkg, deps]) => [pkg, new Set(deps)]));
  for (const [pkg, forbidden] of Object.entries(NEVER_REACHES)) {
    const reached = [...reachable(edges, pkg)].filter((target) => forbidden.includes(target));
    assert.deepEqual(reached, [], `"${pkg}" reaches ${reached.join(', ')} in the graph`);
  }
});

test('a workspace with permitted edges passes', () => {
  const root = workspace({
    protocol: {},
    contract: {},
    account: { deps: ['contract', 'protocol'] },
    core: { deps: ['account', 'contract', 'protocol'] },
    connect: { deps: ['account', 'protocol'] },
    'adapter-recovery': { deps: ['core'] },
  });
  assert.deepEqual(checkWorkspace(root), []);
});

test('connect depending on core is rejected, in the manifest and the reference', () => {
  const root = workspace({ core: {}, connect: { deps: ['core'] } });
  const violations = checkWorkspace(root);
  assert.ok(violations.some((v) => v.startsWith('"connect" must not depend on "core"')));
  assert.ok(violations.some((v) => v.startsWith('"connect" must not reference "core"')));
  assert.ok(violations.some((v) => v.startsWith('"connect" reaches "core"')));
});

test('a transitive path from agent to core is rejected', () => {
  const root = workspace({ core: {}, account: { deps: ['core'] }, agent: { deps: ['account'] } });
  const violations = checkWorkspace(root);
  assert.ok(violations.some((v) => v.startsWith('"account" must not depend on "core"')));
  assert.ok(violations.some((v) => v.startsWith('"agent" reaches "core"')));
});

test('a project reference must mirror a dependency', () => {
  const root = workspace({
    protocol: {},
    contract: {},
    account: { deps: ['contract'], refs: ['contract', 'protocol'] },
  });
  assert.deepEqual(checkWorkspace(root), [
    '"account" references "protocol" without depending on it (architecture, Dependency rules).',
  ]);
});

test('an unknown or misnamed package is rejected', () => {
  const root = workspace({ onboard: {}, protocol: { name: '@other/protocol' } });
  const violations = checkWorkspace(root);
  assert.ok(violations.some((v) => v.startsWith('"onboard" is not in the graph')));
  assert.ok(violations.some((v) => v.startsWith('"protocol" must be named')));
});
