// Manifest- and project-reference-level check of the dependency graph
// (docs/architecture.md, "Dependency rules"). The import-level twin is
// scripts/lint-boundaries.mjs; both consume scripts/dependency-graph.mjs.
// An empty workspace passes, and each package added later is checked:
// - its directory is in the graph, and its name is the scoped package name;
// - each @midnight-ntwrk/mn-passport-* dependency is a permitted edge;
// - its tsconfig project references mirror those dependencies;
// - `connect`, `agent`, and `ecosystems` reach no forbidden package, not even
//   transitively.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { ALLOWED, NEVER_REACHES, SCOPE } from './dependency-graph.mjs';

/**
 * @typedef {{ dependencies?: Record<string, string>, devDependencies?: Record<string, string>, peerDependencies?: Record<string, string>, name?: string }} Manifest
 * @typedef {{ references?: { path: string }[] }} ProjectConfig
 */

/** @param {string} path @returns {unknown} */
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/**
 * Returns each violation of the dependency rules in the workspace at `root`.
 * @param {string} root
 * @returns {string[]}
 */
export function checkWorkspace(root) {
  const packagesDir = join(root, 'packages');
  if (!existsSync(packagesDir)) return [];
  const dirs = readdirSync(packagesDir)
    .filter((dir) => statSync(join(packagesDir, dir)).isDirectory())
    .sort();

  /** @type {string[]} */
  const violations = [];
  /** @type {Map<string, Set<string>>} */
  const edges = new Map();

  for (const dir of dirs) {
    const allowed = ALLOWED[dir];
    if (!allowed) {
      violations.push(
        `"${dir}" is not in the graph — add it to scripts/dependency-graph.mjs deliberately`,
      );
      continue;
    }
    const manifestPath = join(packagesDir, dir, 'package.json');
    if (!existsSync(manifestPath)) {
      violations.push(`"${dir}" has no package.json`);
      continue;
    }
    const manifest = /** @type {Manifest} */ (readJson(manifestPath));
    if (manifest.name !== SCOPE + dir) {
      violations.push(`"${dir}" must be named "${SCOPE}${dir}", got "${manifest.name}"`);
    }
    const deps = new Set(
      Object.keys({
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.peerDependencies,
      })
        .filter((name) => name.startsWith(SCOPE))
        .map((name) => name.slice(SCOPE.length)),
    );
    for (const dep of deps) {
      if (!allowed.includes(dep)) violations.push(`"${dir}" must not depend on "${dep}"`);
    }

    const projectPath = join(packagesDir, dir, 'tsconfig.json');
    const refs = new Set();
    if (existsSync(projectPath)) {
      const project = /** @type {ProjectConfig} */ (readJson(projectPath));
      for (const ref of project.references ?? []) {
        const target = relative(packagesDir, resolve(packagesDir, dir, ref.path)).split(sep)[0];
        if (!target || target === '..') continue; // Not a workspace package.
        refs.add(target);
        if (!allowed.includes(target)) {
          violations.push(`"${dir}" must not reference "${target}" in tsconfig.json`);
        } else if (!deps.has(target)) {
          violations.push(`"${dir}" references "${target}" without depending on it`);
        }
      }
      for (const dep of deps) {
        if (!refs.has(dep))
          violations.push(`"${dir}" depends on "${dep}" without a project reference`);
      }
    }
    edges.set(dir, new Set([...deps, ...refs]));
  }

  for (const [pkg, forbidden] of Object.entries(NEVER_REACHES)) {
    for (const target of reachable(edges, pkg)) {
      if (forbidden.includes(target))
        violations.push(`"${pkg}" reaches "${target}", even transitively`);
    }
  }
  return violations.map((v) => `${v} (architecture, Dependency rules).`);
}

/**
 * Every package reachable from `start` along `edges`.
 * @param {Map<string, Set<string>>} edges
 * @param {string} start
 * @returns {Set<string>}
 */
export function reachable(edges, start) {
  /** @type {Set<string>} */
  const seen = new Set();
  const walk = (/** @type {string} */ pkg) => {
    for (const dep of edges.get(pkg) ?? []) {
      if (!seen.has(dep)) {
        seen.add(dep);
        walk(dep);
      }
    }
  };
  walk(start);
  return seen;
}
