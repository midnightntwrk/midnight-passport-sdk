#!/usr/bin/env node
// Maintains the multi-version ACC binding registry (FS-0.2 §4.1, D-8;
// ADR 0004 — compilation is deterministic, so the committed hashes are
// re-derivable from each version's pinned source and toolchain). Compiles
// the externally-owned ACC source into a per-version artefact directory and
// regenerates the committed registry: every supported binding version with
// its own source hash, toolchain, content hashes, and keyLocations, plus
// the `current` pointer new deploys use. This script is interim tooling
// whose fate https://github.com/midnightntwrk/passport/issues/116 decides:
// contract-repo publishing (option A) retires it in favour of downloading
// published bytes; SDK-release versioning (option B) promotes it into the
// release pipeline. Prover keys are large and public; they stay in the
// artefact directories, addressed by keyLocation, never committed
// (provider-integration §5.1, §6).
//
// Usage:
//   node scripts/build-acc-artefact.mjs                    # rebuild the current version
//   node scripts/build-acc-artefact.mjs --pin <v>          # add <v> to the registry (current unchanged)
//   node scripts/build-acc-artefact.mjs --pin <v> --current  # add <v> and point new deploys at it
//   node scripts/build-acc-artefact.mjs --force …          # permit re-pinning a version whose source changed
//   node scripts/build-acc-artefact.mjs --check [<v>]      # verify <v> (default current) against the registry;
//                                                          # for current, also recompile and compare (determinism)
//
// Retiring a version is a reviewed deletion from the registry JSON (plus a
// manifest regeneration), never a script action — live accounts may still
// be deployed at it (D-8).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** @typedef {{ zkir: string, bzkir: string, verifierKey: string, proverKey: string }} CircuitHashes */
/** @typedef {{ pure: boolean, proof: boolean, keyLocation?: string, hashes?: CircuitHashes }} CircuitPin */
/** @typedef {{ provisional: boolean, source: { path: string, sha256: string }, toolchain: Record<string, string>, moduleHashes: Record<string, string>, circuits: Record<string, CircuitPin> }} AccBinding */
/** @typedef {{ current: string, versions: Record<string, AccBinding> }} AccRegistry */

const SOURCE =
  process.env.MN_PASSPORT_ACC_SOURCE ??
  '../passport/experiments/account-custody-prototype/contracts/account.compact';
const ARTEFACT_ROOT = 'packages/contract/artefact';
const REGISTRY_PATH = 'packages/contract/acc-versions.generated.json';
const MANIFEST_PATH = 'packages/contract/src/manifest.generated.ts';
const MODULE_FILES = ['contract/index.js', 'contract/index.d.ts', 'compiler/contract-info.json'];
const BOOTSTRAP_VERSION = '0.0.0-prototype.1';
// No path separators or traversal: the version names an artefact directory
// and the acc/<version>/<circuit> keyLocation namespace.
const VERSION_RE = /^[0-9a-zA-Z][0-9a-zA-Z.-]*$/;

const args = process.argv.slice(2);
/** @param {string} name */
const takeFlag = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
};
/** @param {string} name */
const takeOption = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const CHECK = takeFlag('--check');
const FORCE = takeFlag('--force');
const MAKE_CURRENT = takeFlag('--current');
const pinVersion = takeOption('--pin');
const positional = args[0];

/** @param {string} path */
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** @param {string} message @returns {never} */
function fail(message) {
  console.error(message);
  process.exit(1);
}

/** @returns {AccRegistry} */
function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) return { current: BOOTSTRAP_VERSION, versions: {} };
  const { current, versions } = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  return { current, versions };
}

// The committed files are Prettier-formatted (the format gate runs on
// them), so the generator must emit exactly what Prettier would — format
// before writing or comparing, or checks false-drift on style alone.
// (Exactly the mistake behind ADR 0003's false finding.)
/** @param {string} text @param {string} filepath */
function prettify(text, filepath) {
  return execFileSync('pnpm', ['exec', 'prettier', '--stdin-filepath', filepath], {
    encoding: 'utf8',
    input: text,
  });
}

/** Compile `SOURCE` into `dir` and derive its registry entry. @param {string} dir @param {string} version @returns {AccBinding} */
function compileEntry(dir, version) {
  console.log(`Compiling ${SOURCE} → ${dir} (this takes ~30 s)…`);
  execFileSync('compact', ['compile', SOURCE, dir], { stdio: 'inherit' });
  const cliVersion = execFileSync('compact', ['--version'], { encoding: 'utf8' }).trim();
  const info = JSON.parse(readFileSync(join(dir, 'compiler', 'contract-info.json'), 'utf8'));
  /** @type {Record<string, CircuitPin>} */
  const circuits = {};
  for (const circuit of [...info.circuits].sort((a, b) => a.name.localeCompare(b.name))) {
    circuits[circuit.name] = circuit.proof
      ? {
          pure: circuit.pure,
          proof: true,
          // Extension-free, circuit-scoped: resolvers add layout + suffixes
          // (provider-integration §5.1, §6).
          keyLocation: `acc/${version}/${circuit.name}`,
          hashes: {
            zkir: sha256(join(dir, 'zkir', `${circuit.name}.zkir`)),
            bzkir: sha256(join(dir, 'zkir', `${circuit.name}.bzkir`)),
            verifierKey: sha256(join(dir, 'keys', `${circuit.name}.verifier`)),
            proverKey: sha256(join(dir, 'keys', `${circuit.name}.prover`)),
          },
        }
      : { pure: circuit.pure, proof: false };
  }
  return {
    // [PROVISIONAL] — SDK-assigned over the unversioned prototype until the
    // passport#116 decision delivers publisher versioning.
    provisional: true,
    source: { path: SOURCE, sha256: sha256(SOURCE) },
    toolchain: {
      cliVersion,
      compilerVersion: info['compiler-version'],
      languageVersion: info['language-version'],
      runtimeVersion: info['runtime-version'],
    },
    moduleHashes: Object.fromEntries(MODULE_FILES.map((rel) => [rel, sha256(join(dir, rel))])),
    circuits,
  };
}

/** @param {AccRegistry} registry */
function writeRegistry(registry) {
  const ordered = {
    current: registry.current,
    versions: Object.fromEntries(
      Object.entries(registry.versions).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
  const json = { $generatedBy: 'scripts/build-acc-artefact.mjs', schemaVersion: 1, ...ordered };
  writeFileSync(REGISTRY_PATH, prettify(JSON.stringify(json, null, 2), REGISTRY_PATH));
  const ts = `// GENERATED by scripts/build-acc-artefact.mjs — do not edit by hand.
// TypeScript mirror of acc-versions.generated.json: every supported ACC
// binding version (FS-0.2 §4.1, D-8; the binding axis, architecture §4.6;
// integrity model per ADR 0004 — compilation is deterministic, so each
// version's hashes are re-derivable from its pinned source and toolchain).
// The circuit tables are artefact inventory, not the supported caller
// surface. Resolution logic lives in src/registry.ts.
// Regenerate: pnpm run build:artefact.

export interface CircuitHashes {
  readonly zkir: string;
  readonly bzkir: string;
  readonly verifierKey: string;
  readonly proverKey: string;
}

export interface CircuitPin {
  readonly pure: boolean;
  readonly proof: boolean;
  readonly keyLocation?: string;
  readonly hashes?: CircuitHashes;
}

export interface AccBinding {
  readonly provisional: boolean;
  readonly source: { readonly path: string; readonly sha256: string };
  readonly toolchain: {
    readonly cliVersion: string;
    readonly compilerVersion: string;
    readonly languageVersion: string;
    readonly runtimeVersion: string;
  };
  readonly moduleHashes: Readonly<Record<string, string>>;
  readonly circuits: Readonly<Record<string, CircuitPin>>;
}

export interface AccRegistry {
  readonly current: string;
  readonly versions: Readonly<Record<string, AccBinding>>;
}

export const ACC_REGISTRY: AccRegistry = ${JSON.stringify(ordered, null, 2)};
`;
  writeFileSync(MANIFEST_PATH, prettify(ts, MANIFEST_PATH));
}

/** Verify the on-disk artefact for `version` against its registry entry. @param {string} version @param {AccBinding} entry */
function verifyArtefact(version, entry) {
  const dir = join(ARTEFACT_ROOT, version);
  if (!existsSync(dir)) {
    fail(
      `Artefact missing — nothing at ${dir}; run \`pnpm run build:artefact -- --pin ${version}\`.`,
    );
  }
  /** @type {[string, string][]} */
  const expectations = Object.entries(entry.moduleHashes);
  for (const [name, pin] of Object.entries(entry.circuits)) {
    if (!pin.hashes) continue;
    expectations.push(
      [`zkir/${name}.zkir`, pin.hashes.zkir],
      [`zkir/${name}.bzkir`, pin.hashes.bzkir],
      [`keys/${name}.verifier`, pin.hashes.verifierKey],
      [`keys/${name}.prover`, pin.hashes.proverKey],
    );
  }
  for (const [rel, expected] of expectations) {
    let actual;
    try {
      actual = sha256(join(dir, rel));
    } catch {
      fail(
        `Integrity mismatch — ${version}/${rel} is missing; a partial artefact. Rebuild it (ADR 0004).`,
      );
    }
    if (actual !== expected) {
      fail(
        `Integrity mismatch — ${version}/${rel} does not match the registry; a stale, partial, ` +
          'or corrupted artefact. Rebuild it (ADR 0004; ZkArtifactIntegrityError at load, T3).',
      );
    }
  }
}

const registry = loadRegistry();

if (CHECK) {
  const version = positional ?? registry.current;
  const entry = registry.versions[version];
  if (!entry) {
    fail(
      `Unknown binding — "${version}" is not in the registry (supported: ${Object.keys(registry.versions).join(', ') || 'none'}).`,
    );
  }
  verifyArtefact(version, entry);
  if (version === registry.current && existsSync(SOURCE)) {
    // Determinism check (ADR 0004): a fresh compile of the current version
    // must reproduce its committed entry exactly.
    const scratch = mkdtempSync(join(tmpdir(), 'acc-check-'));
    try {
      const candidate = compileEntry(scratch, version);
      if (JSON.stringify(candidate) !== JSON.stringify(entry)) {
        fail(
          'Binding drift — a fresh compile does not reproduce the committed entry for ' +
            `${version}: the source, toolchain, or artefact bytes changed. If intended, ` +
            'regenerate with `pnpm run build:artefact` (ADR 0004).',
        );
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
  console.log(`Binding verified — ${version} matches the committed registry.`);
  process.exit(0);
}

const version = pinVersion ?? registry.current;
if (pinVersion !== undefined && !VERSION_RE.test(pinVersion)) {
  fail(
    `Version invalid — "${pinVersion}" must match ${VERSION_RE} (it names a directory and the keyLocation namespace).`,
  );
}
if (!existsSync(SOURCE)) {
  fail(`Source missing — no ACC source at ${SOURCE}; set MN_PASSPORT_ACC_SOURCE (FS-0.2 D-6).`);
}
const existing = registry.versions[version];
if (existing && existing.source.sha256 !== sha256(SOURCE) && !FORCE) {
  fail(
    `Rebrand refused — "${version}" is already pinned to a different source ` +
      `(${existing.source.sha256.slice(0, 12)}…); live accounts may be deployed at it (D-8). ` +
      'Pin a new version instead, or pass --force for a deliberate, reviewed re-pin.',
  );
}

registry.versions[version] = compileEntry(join(ARTEFACT_ROOT, version), version);
if (Object.keys(registry.versions).length === 1) registry.current = version;
else if (MAKE_CURRENT && pinVersion) registry.current = pinVersion;

writeRegistry(registry);
console.log(
  `Registry written — ${Object.keys(registry.versions).length} supported version(s), current ${registry.current}.`,
);
