import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCOPE } from '../scripts/dependency-graph.mjs';
import { lintWorkspace } from '../scripts/lint-boundaries.mjs';

/** @type {string[]} */
const fixtures = [];
after(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
});

/** @param {string} dep @returns {string} */
const imp = (dep) => `import '${SCOPE}${dep}';\n`;

/**
 * A `null` entry makes a package directory with no src.
 * @param {Record<string, Record<string, string> | null>} packages
 * @returns {string}
 */
function workspace(packages) {
  const root = mkdtempSync(join(tmpdir(), 'mn-passport-lint-'));
  fixtures.push(root);
  for (const [dir, files] of Object.entries(packages)) {
    if (files === null) {
      mkdirSync(join(root, 'packages', dir), { recursive: true });
      continue;
    }
    const srcDir = join(root, 'packages', dir, 'src');
    mkdirSync(srcDir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(srcDir, name), content);
    }
  }
  return root;
}

test('the repository packages respect the import boundaries', () => {
  const { violations, linted } = lintWorkspace(fileURLToPath(new URL('..', import.meta.url)));
  assert.deepEqual(violations, []);
  assert.ok(linted.length > 0, 'the lint must cover the scaffolded packages');
});

test('a workspace with permitted imports passes, and reports its coverage', () => {
  const root = workspace({
    protocol: { 'index.ts': 'export {};\n' },
    contract: { 'index.ts': 'export {};\n' },
    core: { 'index.ts': imp('contract') + imp('protocol') },
    connect: { 'index.ts': imp('core') },
    'adapter-broadcast': { 'index.ts': imp('core') },
  });
  const { violations, linted } = lintWorkspace(root);
  assert.deepEqual(violations, []);
  assert.equal(linted.length, 5);
});

test('a direct owner import from connect fails (rule 4)', () => {
  const root = workspace({
    owner: { 'index.ts': 'export {};\n' },
    connect: { 'index.ts': imp('owner') },
  });
  const { violations } = lintWorkspace(root);
  assert.ok(
    violations.some(
      (v) =>
        v.includes('packages/connect/src/index.ts') &&
        v.includes(`"connect" must not import "${SCOPE}owner"`),
    ),
    violations.join('\n'),
  );
});

test('a transitive path from connect to owner fails on its forbidden edge (rule 4)', () => {
  const root = workspace({
    owner: { 'index.ts': 'export {};\n' },
    core: { 'index.ts': imp('owner') },
    connect: { 'index.ts': imp('core') },
  });
  const { violations } = lintWorkspace(root);
  assert.ok(
    violations.some((v) => v.includes(`"core" must not import "${SCOPE}owner"`)),
    'the forbidden core → owner edge in the path must fail',
  );
  assert.ok(
    !violations.some((v) => v.includes('packages/connect/')),
    'connect → core is permitted, so connect itself has no violation',
  );
});

test('an adapter importing outside its allowed list fails', () => {
  const root = workspace({
    'adapter-broadcast': { 'index.ts': imp('protocol') },
  });
  const { violations } = lintWorkspace(root);
  assert.ok(
    violations.some((v) => v.includes(`"adapter-broadcast" must not import "${SCOPE}protocol"`)),
    violations.join('\n'),
  );
});

test('a platform-neutral package importing a Node built-in fails', () => {
  const root = workspace({
    core: { 'index.ts': "import { readFileSync } from 'node:fs';\nexport {};\n" },
  });
  const { violations } = lintWorkspace(root);
  assert.ok(
    violations.some((v) => v.includes('"core" must not import "node:fs"')),
    violations.join('\n'),
  );
});

test('a package that is not in the graph fails', () => {
  const root = workspace({ onboard: { 'index.ts': 'export {};\n' } });
  const { violations } = lintWorkspace(root);
  assert.ok(violations.some((v) => v.includes('"onboard" is not in the graph')));
});

test('a scaffolded package with no src fails', () => {
  const root = workspace({ core: null });
  const { violations } = lintWorkspace(root);
  assert.ok(violations.some((v) => v.includes('"core" has no src/')));
});
