#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseJson } from './json.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const MANIFEST_PATH = join(ROOT, 'packages/contract/generated/passport-manifest.json');
const PIN_PATH = join(ROOT, 'packages/contract/src/pin.ts');

// The contract planner's deploy order and per-wave budget. Wave 1 is part of the address.
const WAVE_ONE_ORDER = `deposit_unshielded deposit_shielded activate_initial_device
  withdraw_unshielded append_inbox withdraw_shielded withdraw_shielded_to_contract
  rotate_enc_key add_device remove_device`.split(/\s+/);
export const VERIFIER_BYTE_BUDGET = 15000;

/** @typedef {Record<string, { size: number, sha256: string } | undefined>} FileTable */
/** @typedef {{ source: { commit: string }, toolchain: { compiler: string, runtime: string, zkir: string }, files: FileTable }} Manifest */

/** @param {string | Buffer} data */
export const pinOf = (data) => createHash('sha256').update(data).digest('hex');

/** @template T @param {string} path @returns {T} */
const readJson = (path) => /** @type {T} */ (parseJson(readFileSync(path, 'utf8')));

/**
 * The deploy carries the longest prefix that fits, not the best fit.
 * @param {(circuit: string) => number} verifierSize
 * @param {string} arm
 */
export function waveOne(verifierSize, arm) {
  /** @type {string[]} */
  const wave = [];
  let bytes = 0;
  for (const base of WAVE_ONE_ORDER) {
    const circuit = base.startsWith('deposit_') ? base : `${base}_with_${arm}`;
    bytes += verifierSize(circuit);
    if (bytes > VERIFIER_BYTE_BUDGET) break;
    wave.push(circuit);
  }
  if (!wave.length) throw new Error(`${arm}: the first circuit is over the wave budget`);
  return wave;
}

/**
 * @param {string} dir
 * @param {{ commit: string, zkir: string }} input
 * @returns {string} the manifest text, whose bytes the pin hashes
 */
export function buildManifest(dir, { commit, zkir }) {
  // A stale or hand-edited directory disagrees with the compiler's own manifest.
  /** @type {Record<string, Record<string, { hash?: string } | undefined> | undefined>} */
  const listed = readJson(join(dir, 'compiler/contract-manifest.json'));
  /** @type {FileTable} */
  const files = {};
  for (const sub of ['compiler', 'contract', 'keys', 'zkir']) {
    for (const name of readdirSync(join(dir, sub)).sort()) {
      if (name === 'contract-manifest.json') continue;
      const bytes = readFileSync(join(dir, sub, name));
      const sha256 = pinOf(bytes);
      if (listed[sub]?.[name]?.hash !== sha256) throw new Error(`${sub}/${name}: not as compiled`);
      files[`${sub}/${name}`] = { size: bytes.length, sha256 };
    }
    // Each directory entry of the compiler manifest also has a `type: "directory"` key.
    const missing = Object.keys(listed[sub] ?? {}).find(
      (n) => n !== 'type' && !files[`${sub}/${n}`],
    );
    if (missing) throw new Error(`${sub}/${missing}: compiled but missing`);
  }
  /** @type {Record<string, string> & { circuits: { name: string, proof: boolean, arguments: { type: { length?: number } }[] }[] }} */
  const info = readJson(join(dir, 'compiler/contract-info.json'));
  const all = info.circuits;
  /** @type {Record<string, string[]>} */
  const circuits = { shared: [], jubjub: [], k256: [], p256: [] };
  for (const { name } of all.filter((c) => c.proof)) {
    circuits[/_with_(?:grant_)?(jubjub|k256|p256)$/.exec(name)?.[1] ?? 'shared']?.push(name);
  }
  Object.values(circuits).forEach((names) => names.sort());
  // The second argument of webauthn_client_data_hash holds the origin bytes.
  const originLength = all.find((c) => c.name === 'webauthn_client_data_hash')?.arguments[1]?.type
    .length;
  if (typeof originLength !== 'number') throw new Error('contract-info.json has no origin length');
  /** @param {string} circuit */
  const verifierSize = (circuit) => {
    const entry = files[`keys/${circuit}.verifier`];
    if (!entry) throw new Error(`keys/${circuit}.verifier is missing`);
    return entry.size;
  };
  const manifest = {
    schema: 1,
    source: {
      repository: 'midnightntwrk/passport',
      commit,
      path: 'contract/contracts/account.compact',
    },
    toolchain: {
      compiler: info['compiler-version'],
      compilerCommit: info['compiler-commit'],
      language: info['language-version'],
      runtime: info['runtime-version'],
      zkir,
    },
    originLength,
    circuits,
    waveOne: Object.fromEntries(
      ['jubjub', 'k256', 'p256'].map((a) => [a, waveOne(verifierSize, a)]),
    ),
    files,
  };
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  if (/[^\n\x20-\x7e]/.test(text)) throw new Error('the manifest is not ASCII');
  return text;
}

/** @param {string} hash */
const pinSource = (hash) =>
  `// Written by scripts/acc-pin.mjs. The SHA-256 of packages/contract/generated/passport-manifest.json.\nexport const ACC_MANIFEST_SHA256 =\n  '${hash}';\n`;

/** The pin table: docs/compatibility.md for the compiler, the root package.json for the runtime. */
export function pinnedToolchain() {
  const docs = readFileSync(join(ROOT, 'docs/compatibility.md'), 'utf8');
  const compiler = /^\| Compact toolchain \| (\S+) \|/m.exec(docs)?.[1];
  /** @type {{ devDependencies: Record<string, string | undefined> }} */
  const pkg = readJson(join(ROOT, 'package.json'));
  const runtime = pkg.devDependencies['@midnight-ntwrk/compact-runtime'];
  if (!compiler || !runtime) throw new Error('the pin table has no compiler or runtime row');
  return { compiler, runtime };
}

/** @param {string} text @returns {string[]} */
function problemsOf(text) {
  const { toolchain } = /** @type {Manifest} */ (parseJson(text));
  const pinned = pinnedToolchain();
  return /** @type {const} */ (['compiler', 'runtime'])
    .filter((key) => toolchain[key] !== pinned[key])
    .map((key) => `${key} ${toolchain[key]} is not the pinned ${pinned[key]}`);
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      check: { type: 'boolean' },
      'source-commit': { type: 'string' },
      zkir: { type: 'string' },
    },
  });
  const [dir] = positionals;
  if (!dir)
    throw new Error(
      'usage: acc-pin.mjs <managed-dir> (--check | --source-commit <sha> --zkir <tag (commit)>)',
    );

  if (values.check) {
    const committed = readFileSync(MANIFEST_PATH, 'utf8');
    const { source, toolchain, files } = /** @type {Manifest} */ (parseJson(committed));
    const built = buildManifest(dir, { commit: source.commit, zkir: toolchain.zkir });
    const problems = problemsOf(built);
    if (built !== committed) {
      const now = /** @type {Manifest} */ (parseJson(built)).files;
      const paths = [...new Set([...Object.keys(now), ...Object.keys(files)])];
      const changed = paths.filter((p) => now[p]?.sha256 !== files[p]?.sha256);
      problems.push(`the manifest differs; changed files: ${changed.join(', ') || 'none'}`);
    }
    if (readFileSync(PIN_PATH, 'utf8') !== pinSource(pinOf(committed))) {
      problems.push('src/pin.ts does not hold the manifest hash');
    }
    if (problems.length) throw new Error(problems.join('\n'));
    console.log(`acc-pin: ${dir} matches ${pinOf(committed)}`);
    return;
  }

  const commit = values['source-commit'];
  const zkir = values.zkir;
  if (!commit || !/^[0-9a-f]{40}$/.test(commit) || !zkir) {
    throw new Error('write mode needs --source-commit <40-hex sha> and --zkir <tag (commit)>');
  }
  const text = buildManifest(dir, { commit, zkir });
  const problems = problemsOf(text);
  if (problems.length) throw new Error(problems.join('\n'));
  writeFileSync(MANIFEST_PATH, text);
  writeFileSync(PIN_PATH, pinSource(pinOf(text)));
  console.log(`acc-pin: wrote ${pinOf(text)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
