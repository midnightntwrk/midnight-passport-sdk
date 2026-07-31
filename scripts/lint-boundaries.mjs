#!/usr/bin/env node
// Import-level dependency-boundary lint (FS-0.1 D-3; architecture §4.4).
// Every workspace package may import only the @midnight-ntwrk/mn-passport-*
// packages the architecture permits — most critically, `connect` must never
// import `core` or any adapter, so a dApp can never pull the kernel into its
// bundle. Also enforces platform neutrality at the import level: the four
// packages that reach browser/PWA bundles (`protocol`, `contract`, `core`,
// and `connect` — architecture §4.4) must not import Node built-ins; only
// adapters may be platform-specific. The manifest-level twin lives in
// tests/dependency-rules.test.mjs; both consume scripts/dependency-graph.mjs.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ALLOWED, SCOPE } from './dependency-graph.mjs';

// Matches static imports, re-exports, side-effect imports, require(), and
// dynamic import() — with ', ", or ` around the specifier.
const IMPORT_RE =
  /(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"`](@midnight-ntwrk\/mn-passport-[^'"`/]+)/g;
const NODE_BUILTIN_RE = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"`](node:[^'"`]+)/g;
const PLATFORM_NEUTRAL = new Set(['protocol', 'contract', 'core', 'connect']);
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

/** @type {string[]} */
const violations = [];
for (const [pkg, allowed] of Object.entries(ALLOWED)) {
  const allowedNames = new Set(allowed.map((d) => SCOPE + d));
  let files;
  try {
    files = sourceFiles(join('packages', pkg, 'src'));
  } catch {
    continue; // The package is not scaffolded yet — nothing to lint.
  }
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(IMPORT_RE)) {
      const target = match[1] ?? '';
      if (!allowedNames.has(target)) {
        violations.push(`${file}: "${pkg}" must not import "${target}" (architecture §4.4).`);
      }
    }
    if (PLATFORM_NEUTRAL.has(pkg)) {
      for (const match of text.matchAll(NODE_BUILTIN_RE)) {
        violations.push(
          `${file}: "${pkg}" must not import "${match[1]}" — it ships to browser/PWA bundles (architecture §4.4).`,
        );
      }
      for (const match of text.matchAll(GLOBAL_DECLARATION_RE)) {
        const name = match[1] ?? '';
        if (!ALLOWED_GLOBALS.has(name)) {
          violations.push(
            `${file}: "${pkg}" declares ambient global "${name}" — only allowlisted cross-platform globals are permitted (architecture §4.4).`,
          );
        }
      }
    }
  }
}

if (violations.length > 0) {
  for (const v of violations) console.error(`Boundary violation — ${v}`);
  process.exit(1);
}
console.log('Dependency boundaries respected (architecture §4.4).');
