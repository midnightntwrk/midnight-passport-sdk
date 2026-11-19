import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkSingleCopy } from '../scripts/check-single-copy.mjs';

const script = fileURLToPath(new URL('../scripts/check-single-copy.mjs', import.meta.url));

/** @param {string} path */
function run(path) {
  const file = fileURLToPath(new URL(path, import.meta.url));
  return spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
}

const BASE = [
  '@midnight-ntwrk/compact-js@3.0.2',
  '@midnight-ntwrk/compact-runtime@0.21.0',
  '@midnightntwrk/ledger-v9@1.0.2',
  'effect@3.22.4',
];

/**
 * @param {string[]} packages
 * @param {Record<string, string>} dependencies
 */
function lockfile(packages, dependencies = {}) {
  const lines = ['lockfileVersion: 9.0', '', 'packages:'];
  for (const pair of packages) lines.push(`  '${pair}':`, '    resolution: {}', '');
  lines.push('snapshots:', "  'consumer@1.0.0':", '    dependencies:');
  for (const [key, value] of Object.entries(dependencies)) lines.push(`      '${key}': ${value}`);
  return lines.join('\n');
}

const ALIAS = { 'compact-runtime-ledger8': "'@midnight-ntwrk/compact-runtime@0.16.0'" };

test('the workspace lockfile has one copy of each package', () => {
  const result = run('../pnpm-lock.yaml');
  assert.equal(result.status, 0, result.stderr);
});

test('a lockfile with two copies fails', () => {
  const result = run('fixtures/two-copies.lock.yaml');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /compact-js: 2 copies/);
});

test('the ledger 8 alias of compact-runtime is the only allowed second copy', () => {
  const withAlias = [...BASE, '@midnight-ntwrk/compact-runtime@0.16.0'];
  assert.deepEqual(checkSingleCopy(lockfile(withAlias, ALIAS)), []);
  const direct = { ...ALIAS, '@midnight-ntwrk/compact-runtime': '0.16.0' };
  assert.match(checkSingleCopy(lockfile(withAlias, direct)).join(), /compact-runtime: 2 copies/);
  const third = [...withAlias, '@midnight-ntwrk/compact-runtime@0.20.0'];
  assert.match(checkSingleCopy(lockfile(third, ALIAS)).join(), /compact-runtime: 3 copies/);
  const moved = [...BASE, '@midnight-ntwrk/compact-runtime@0.17.0'];
  const movedAlias = { 'compact-runtime-ledger8': "'@midnight-ntwrk/compact-runtime@0.17.0'" };
  assert.match(checkSingleCopy(lockfile(moved, movedAlias)).join(), /compact-runtime: 2 copies/);
});

test('the two ledger-v9 scopes count as one package', () => {
  const both = [...BASE, '@midnight-ntwrk/ledger-v9@1.0.2'];
  assert.match(checkSingleCopy(lockfile(both)).join(), /ledger-v9: 2 copies/);
});

test('only Effect 3 is counted, and a missing package fails', () => {
  assert.deepEqual(checkSingleCopy(lockfile([...BASE, 'effect@4.1.3'])), []);
  const noLedger = BASE.filter((pair) => !pair.includes('ledger'));
  assert.match(checkSingleCopy(lockfile(noLedger)).join(), /ledger-v9: not in the lockfile/);
});
