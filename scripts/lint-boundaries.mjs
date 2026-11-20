#!/usr/bin/env node
// Import-level dependency-boundary lint (docs/architecture.md, "Dependency
// rules"). Each workspace package can import only the
// @midnight-ntwrk/mn-passport-* packages that the graph permits. Most
// important: `connect` and `agent` never import `owner`. Platform-neutral
// packages must not import Node built-ins. The graph lives in
// scripts/dependency-graph.mjs.
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWED, PLATFORM_NEUTRAL, SCOPE } from './dependency-graph.mjs';

// Matches static imports, re-exports, side-effect imports, require(), and
// dynamic import() — with ', ", or ` around the specifier.
const IMPORT_RE =
  /(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"`](@midnight-ntwrk\/mn-passport-[^'"`/]+)/g;
const NODE_BUILTIN_RE = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"`](node:[^'"`]+)/g;
// Ambient global declarations bypass import scanning, so they are gated by
// an explicit allowlist: only cross-platform standards may be assumed.
const GLOBAL_DECLARATION_RE = /declare\s+(?:const|var|let|function)\s+(\w+)/g;
const ALLOWED_GLOBALS = new Set(['crypto']);

/** @param {string} dir @returns {string[]} */
function sourceFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|mts|cts|js|mjs|cjs)$/.test(entry)) out.push(path);
  }
  return out;
}

/** @param {string} root @returns {{ violations: string[], linted: string[] }} */
export function lintWorkspace(root) {
  const packagesDir = join(root, 'packages');
  /** @type {string[]} */
  const violations = [];
  /** @type {string[]} */
  const linted = [];

  /** @type {string[]} */
  let dirs;
  try {
    dirs = readdirSync(packagesDir)
      .filter((dir) => statSync(join(packagesDir, dir)).isDirectory())
      .sort();
  } catch {
    return { violations, linted }; // A workspace with no packages/ has nothing to lint.
  }

  for (const pkg of dirs) {
    const allowed = ALLOWED[pkg];
    if (!allowed) {
      violations.push(
        `packages/${pkg}: "${pkg}" is not in the graph — add it to scripts/dependency-graph.mjs deliberately (architecture, Dependency rules).`,
      );
      continue;
    }
    const srcDir = join(packagesDir, pkg, 'src');
    /** @type {string[]} */
    let files;
    try {
      files = sourceFiles(srcDir);
    } catch {
      violations.push(
        `packages/${pkg}: "${pkg}" has no src/ to lint (architecture, Dependency rules).`,
      );
      continue;
    }
    linted.push(pkg);

    const allowedNames = new Set(allowed.map((dep) => SCOPE + dep));
    for (const file of files) {
      const where = relative(root, file);
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(IMPORT_RE)) {
        const target = match[1] ?? '';
        if (!allowedNames.has(target)) {
          violations.push(
            `${where}: "${pkg}" must not import "${target}" (architecture, Dependency rules).`,
          );
        }
      }
      if (PLATFORM_NEUTRAL.has(pkg)) {
        for (const match of text.matchAll(NODE_BUILTIN_RE)) {
          violations.push(
            `${where}: "${pkg}" must not import "${match[1] ?? ''}" — it ships to browser/PWA bundles (architecture, Dependency rules).`,
          );
        }
        for (const match of text.matchAll(GLOBAL_DECLARATION_RE)) {
          const name = match[1] ?? '';
          if (!ALLOWED_GLOBALS.has(name)) {
            violations.push(
              `${where}: "${pkg}" declares ambient global "${name}" — only allowlisted cross-platform globals are permitted (architecture, Dependency rules).`,
            );
          }
        }
      }
    }
  }
  return { violations, linted };
}

// import.meta.main may be absent on Node 22, so compare the entry path.
const entry = process.argv[1] ? realpathSync(process.argv[1]) : '';
if (entry && entry === realpathSync(fileURLToPath(import.meta.url))) {
  const { violations, linted } = lintWorkspace(process.cwd());
  if (violations.length > 0) {
    for (const v of violations) console.error(`Boundary violation — ${v}`);
    process.exit(1);
  }
  console.log(
    `Dependency boundaries respected across ${linted.length} package(s) (architecture, Dependency rules).`,
  );
}
