#!/usr/bin/env node
// 7-day dependency cooldown (docs/development-workflow.md §2 deps / §4).
// Fails when the lockfile introduces a package version published less than
// 7 days ago — the window in which a supply-chain compromise is most often
// caught and yanked. Override: a "Cooldown-override: <reason>" line in the
// PR description (passed via the PR_BODY env var), for urgent security
// patches only — a conscious, recorded decision.
//
// Usage: node check-dep-cooldown.mjs [base-ref]   (default origin/main)
// Supports pnpm lockfiles (pnpm-lock.yaml v9) and npm lockfiles
// (package-lock.json v2/v3).
import { execFileSync } from 'node:child_process';

const COOLDOWN_DAYS = 7;
const LOCKFILES = ['pnpm-lock.yaml', 'package-lock.json'];
const base = process.argv[2] ?? 'origin/main';

const override = (process.env.PR_BODY ?? '').match(/^\s*cooldown-override:\s*(\S.*)$/im);

function gitShow(ref, path) {
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

function npmVersionPairs(lockText) {
  const out = new Set();
  const lock = JSON.parse(lockText);
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (!path || entry.link) continue; // root project or workspace link
    const idx = path.lastIndexOf('node_modules/');
    if (idx === -1) continue;
    const name = path.slice(idx + 'node_modules/'.length);
    if (entry.version) out.add(`${name}@${entry.version}`);
  }
  return out;
}

function pnpmVersionPairs(lockText) {
  // pnpm-lock.yaml v9: entries are two-space-indented keys under the
  // top-level `packages:` block, e.g. "  '@types/node@22.20.1':" or
  // "  prettier@3.9.6:"; peer-dependency suffixes sit in parentheses.
  const out = new Set();
  let inPackages = false;
  for (const line of lockText.split('\n')) {
    if (/^\S/.test(line)) inPackages = line.startsWith('packages:');
    if (!inPackages) continue;
    const m = line.match(/^ {2}'?([^'\n]+?)'?:\s*$/);
    if (m) out.add(m[1].split('(')[0]);
  }
  return out;
}

function versionPairs(file, lockText) {
  if (!lockText) return new Set();
  return file === 'pnpm-lock.yaml' ? pnpmVersionPairs(lockText) : npmVersionPairs(lockText);
}

// Discover EVERY tracked lockfile (root and nested — e.g. the standalone
// experiments/ mini-workspaces), so a nested lockfile cannot bypass the
// cooldown (CLAUDE.md non-negotiable).
const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter((f) => LOCKFILES.includes(f.split('/').pop()));
if (tracked.length === 0) {
  console.log('No lockfile at HEAD — nothing to check.');
  process.exit(0);
}
for (const other of ['yarn.lock', 'bun.lock', 'bun.lockb']) {
  if (gitShow('HEAD', other) !== null) {
    console.log(`::warning::${other} present — the cooldown check reads ${LOCKFILES.join(' / ')} only.`);
  }
}

const added = [];
for (const lf of tracked) {
  const name = lf.split('/').pop();
  const before = versionPairs(name, gitShow(base, lf));
  for (const pair of versionPairs(name, gitShow('HEAD', lf))) {
    // Guard against parser artefacts from lockfile-format drift: a valid
    // pair is <name>@<version> with no whitespace in the name.
    if (!before.has(pair) && /^[^\s]+@[^\s]+$/.test(pair)) added.push(pair);
  }
}

if (added.length === 0) {
  console.log('No new package versions introduced.');
  process.exit(0);
}
console.log(`Checking ${added.length} new package version(s) against the ${COOLDOWN_DAYS}-day cooldown…`);

const now = Date.now();
const violations = [];
for (const pair of added) {
  const at = pair.lastIndexOf('@');
  const name = pair.slice(0, at);
  const version = pair.slice(at + 1);
  let times;
  try {
    times = JSON.parse(
      execFileSync('npm', ['view', name, 'time', '--json'], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      }),
    );
  } catch {
    console.log(`::warning::Could not fetch publish times for ${pair} — skipping.`);
    continue;
  }
  const published = times?.[version];
  if (!published) {
    console.log(`::warning::No publish time recorded for ${pair} — skipping.`);
    continue;
  }
  const ageDays = (now - Date.parse(published)) / 86_400_000;
  if (ageDays < COOLDOWN_DAYS) {
    violations.push(`${pair} — published ${ageDays.toFixed(1)} days ago (${published})`);
  }
}

if (violations.length === 0) {
  console.log('All new package versions are outside the cooldown window.');
  process.exit(0);
}

if (override) {
  console.log(`::warning::Cooldown override in effect — "${override[1].trim()}". Quarantined versions adopted consciously:`);
  for (const v of violations) console.log(`::warning::  ${v}`);
  process.exit(0);
}

console.log('::error::7-day dependency cooldown violated (supply-chain quarantine, docs/development-workflow.md §4):');
for (const v of violations) console.log(`::error::  ${v}`);
console.log('::error::If this is an urgent security patch, add "Cooldown-override: <reason>" to the PR description.');
process.exit(1);
