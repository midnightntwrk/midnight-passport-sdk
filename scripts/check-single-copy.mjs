#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Only `alias` can hold a second copy, and only at `aliasVersion`.
 * @typedef {{ label: string, names: string[], alias?: string, aliasVersion?: string, major?: string }} Group
 */

/** @type {Group[]} */
export const GROUPS = [
  // The same ledger is published under two scopes.
  { label: 'ledger-v9', names: ['@midnightntwrk/ledger-v9', '@midnight-ntwrk/ledger-v9'] },
  { label: 'compact-js', names: ['@midnight-ntwrk/compact-js'] },
  // midnight-js 5.0 installs compact-runtime 0.16.0 under this alias for ledger 8 contracts.
  {
    label: 'compact-runtime',
    names: ['@midnight-ntwrk/compact-runtime'],
    alias: 'compact-runtime-ledger8',
    aliasVersion: '0.16.0',
  },
  // Effect 4 has the same name, and the SDK will add its own copy.
  { label: 'Effect 3', names: ['effect'], major: '3' },
];

/**
 * Uses the last "@", because a scoped name also starts with "@".
 * @param {string} pair
 * @returns {[string, string]}
 */
function split(pair) {
  const at = pair.lastIndexOf('@');
  return [pair.slice(0, at), pair.slice(at + 1)];
}

/** @param {string} text */
function unquote(text) {
  return text.trim().replace(/^'(.*)'$/, '$1');
}

/**
 * Returns each version and the dependency keys that point to it.
 * @param {string} lockText
 */
export function readLockfile(lockText) {
  /** @type {Set<string>} */
  const versions = new Set();
  /** @type {Map<string, Set<string>>} */
  const keys = new Map();
  /** @param {string} key @param {string} value */
  const reference = (key, value) => {
    const target = unquote(value).split('(')[0] ?? '';
    if (target.startsWith('link:')) return;
    // An alias value holds "name@version". A plain value holds only the version.
    const pair = target.lastIndexOf('@') > 0 ? target : `${key}@${target}`;
    if (!keys.has(pair)) keys.set(pair, new Set());
    keys.get(pair)?.add(key);
  };
  // In lockfile format 9, pnpm indents package keys by 2, dependency keys by 6, and versions by 8.
  let block = '';
  let importerKey = '';
  for (const line of lockText.split(/\r?\n/)) {
    if (/^\S/.test(line)) block = line.replace(/:.*$/, '');
    const entry = line.match(/^ {2}([^\s-].*?):\s*(?:\{\})?$/);
    const dependency = line.match(/^ {6}([^\s-].*?):\s*(.*)$/);
    const version = line.match(/^ {8}version:\s*(.+)$/);
    if (block === 'packages' && entry) versions.add(unquote(entry[1] ?? '').split('(')[0] ?? '');
    else if (dependency && (block === 'snapshots' || block === 'importers')) {
      importerKey = unquote(dependency[1] ?? '');
      if (dependency[2]) reference(importerKey, dependency[2]);
    } else if (version && block === 'importers') reference(importerKey, version[1] ?? '');
  }
  return { versions, keys };
}

/**
 * A group with no copy also fails, so a wrong package name cannot pass.
 * @param {string} lockText
 * @returns {string[]}
 */
export function checkSingleCopy(lockText) {
  const { versions, keys } = readLockfile(lockText);
  /** @type {string[]} */
  const problems = [];
  for (const group of GROUPS) {
    const found = [...versions].filter((pair) => {
      const [name, version] = split(pair);
      return group.names.includes(name) && (!group.major || version.startsWith(`${group.major}.`));
    });
    if (found.length === 0) {
      problems.push(`${group.label}: not in the lockfile. Check the package names.`);
      continue;
    }
    const aliased = found.filter((pair) => {
      const used = keys.get(pair);
      const onlyAlias = !!used && used.size > 0 && [...used].every((k) => k === group.alias);
      return !!group.alias && onlyAlias && split(pair)[1] === group.aliasVersion;
    });
    const direct = found.filter((pair) => !aliased.includes(pair));
    if (direct.length > 1 || aliased.length > 1) {
      problems.push(`${group.label}: ${found.length} copies (${found.join(', ')}).`);
    }
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: node scripts/check-single-copy.mjs <lockfile>');
    process.exit(2);
  }
  const problems = checkSingleCopy(readFileSync(path, 'utf8'));
  if (problems.length > 0) {
    for (const p of problems) console.error(`One-copy check: ${p}`);
    process.exit(1);
  }
  console.log(`One copy each: ${GROUPS.map((g) => g.label).join(', ')}.`);
}
