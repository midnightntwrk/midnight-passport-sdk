import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, sep } from 'node:path';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

// Built from fragments, and the test name avoids them, so this file never holds
// the literals it searches for.
const needles = ['midnight:' + 'passport:', 'midnight:' + 'account:'];
const tagModule = join('packages', 'protocol', 'src', 'domain-tags.ts');

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function sources(dir) {
  try {
    const names = await readdir(join(repoRoot, dir), { recursive: true });
    return names
      .filter((n) => /\.[cm]?[jt]sx?$/.test(n))
      .map((n) => join(dir, n))
      .filter((p) => !p.split(sep).some((s) => s === 'node_modules' || s === 'dist'));
  } catch (err) {
    if (err instanceof Error && /** @type {{ code?: string }} */ (err).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

test('the tag prefixes stay inside the tag module', async () => {
  const files = [
    ...(await sources('packages')).filter((p) => p.split(sep).includes('src')),
    ...(await sources('tests')),
    ...(await sources('scripts')),
  ];
  assert.ok(files.includes(tagModule), 'the scan did not reach the tag module');
  /** @type {string[]} */
  const offenders = [];
  for (const rel of files) {
    if (rel === tagModule) continue;
    const text = await readFile(join(repoRoot, rel), 'utf8');
    if (needles.some((needle) => text.includes(needle))) offenders.push(rel);
  }
  assert.deepEqual(offenders, []);
});
