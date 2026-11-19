import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const kernelDir = join(repoRoot, 'packages', 'owner', 'src', 'kernel');
const kernelPublic = join(kernelDir, 'index'); // no extension, so it matches a stripped specifier

// Captures the relative specifier in an import, re-export, require, or dynamic import.
const IMPORT_RE = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"`](\.[^'"`]+)/g;
const SOURCE_RE = /\.(ts|mts|cts|tsx|js|mjs|cjs|jsx)$/;

/** @param {string} path @returns {string} */
const stripExt = (path) => path.replace(SOURCE_RE, '');

/** @param {string} absPath @returns {boolean} */
const isUnderKernel = (absPath) => absPath === kernelDir || absPath.startsWith(kernelDir + sep);

/** @param {string} resolvedNoExt @returns {boolean} */
function isKernelInternal(resolvedNoExt) {
  if (resolvedNoExt === kernelDir || resolvedNoExt === kernelPublic) return false; // the public entry is allowed
  return resolvedNoExt.startsWith(kernelDir + sep);
}

/**
 * @param {{ path: string, text: string }[]} files
 * @returns {string[]}
 */
function kernelBoundaryViolations(files) {
  /** @type {string[]} */
  const violations = [];
  for (const { path, text } of files) {
    if (isUnderKernel(path)) continue;
    for (const match of text.matchAll(IMPORT_RE)) {
      const spec = match[1] ?? '';
      const resolved = stripExt(resolve(dirname(path), spec));
      if (isKernelInternal(resolved)) {
        violations.push(
          `${relative(repoRoot, path)}: imports kernel internal "${spec}" — a module outside ` +
            `the kernel may import only the kernel public entry (E03.04, acceptance criterion 1).`,
        );
      }
    }
  }
  return violations;
}

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // the directory does not exist yet
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (SOURCE_RE.test(entry)) out.push(path);
  }
  return out;
}

/** @returns {{ path: string, text: string }[]} */
function workspaceSourceFiles() {
  const packagesDir = join(repoRoot, 'packages');
  /** @type {{ path: string, text: string }[]} */
  const files = [];
  for (const pkg of readdirSync(packagesDir)) {
    for (const path of walk(join(packagesDir, pkg, 'src'))) {
      files.push({ path, text: readFileSync(path, 'utf8') });
    }
  }
  return files;
}

test('no module outside the kernel imports a kernel internal', () => {
  assert.deepEqual(kernelBoundaryViolations(workspaceSourceFiles()), []);
});

test('the check rejects a planted deep import into the kernel', () => {
  const planted = [
    {
      path: join(repoRoot, 'packages', 'owner', 'src', 'onboard.ts'),
      text: "import { zeroize } from './kernel/zeroize.js';\n",
    },
  ];
  const violations = kernelBoundaryViolations(planted);
  assert.equal(violations.length, 1);
  assert.match(violations[0] ?? '', /imports kernel internal/);
});

test('the check allows an import of the kernel public entry', () => {
  const allowed = [
    {
      path: join(repoRoot, 'packages', 'owner', 'src', 'onboard.ts'),
      text: "import { holdSecret } from './kernel/index.js';\n",
    },
    {
      path: join(repoRoot, 'packages', 'owner', 'src', 'onboard.ts'),
      text: "export { holdSecret } from './kernel';\n", // a directory import resolves to index
    },
  ];
  assert.deepEqual(kernelBoundaryViolations(allowed), []);
});

test('a kernel file may import a kernel sibling', () => {
  const insideKernel = [
    {
      path: join(kernelDir, 'handle.ts'),
      text: "import { zeroize } from './zeroize.js';\n",
    },
  ];
  assert.deepEqual(kernelBoundaryViolations(insideKernel), []);
});
