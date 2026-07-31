// Guards the FS-0.2 §4.1 multi-version binding registry (D-8; ADR 0004):
// the committed registry must be well-formed, resolution and chain-derived
// version detection must behave, and every locally built artefact version
// must match its committed hashes byte-for-byte. Loader-level verification
// and ZkArtifactIntegrityError are T3's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const registryJsonUrl = new URL(
  '../packages/contract/acc-versions.generated.json',
  import.meta.url,
);

const {
  ACC_REGISTRY,
  BINDING_VERSION,
  SUPPORTED_BINDINGS,
  UnsupportedBindingError,
  detectDeployedVersion,
  resolveBinding,
} = await import(new URL('../packages/contract/dist/index.js', import.meta.url).href);

test('the registry is well-formed and current is a supported version', () => {
  assert.ok(SUPPORTED_BINDINGS.length >= 1, 'the registry must hold at least one version');
  assert.ok(SUPPORTED_BINDINGS.includes(BINDING_VERSION), 'current must be a supported version');
  assert.equal(
    resolveBinding(BINDING_VERSION).provisional,
    true,
    'the prototype-era current pin must declare itself provisional',
  );
  for (const version of SUPPORTED_BINDINGS) {
    const binding = resolveBinding(version);
    assert.equal(typeof binding.provisional, 'boolean', `${version} must record its pin status`);
    assert.ok(
      binding.source.path.endsWith('account.compact'),
      `${version}: source must be the ACC`,
    );
    assert.match(binding.source.sha256, /^[0-9a-f]{64}$/);
    for (const field of ['cliVersion', 'compilerVersion', 'languageVersion', 'runtimeVersion']) {
      assert.ok(binding.toolchain[field], `${version}: toolchain.${field} must be recorded`);
    }
  }
});

test('every version pins its full circuit inventory under its own keyLocations', () => {
  for (const version of SUPPORTED_BINDINGS) {
    const binding = resolveBinding(version);
    const pins = Object.entries(binding.circuits);
    const provable = pins.filter(([, pin]) => pin.proof);
    assert.equal(pins.length, 15, `${version} must pin 15 circuits (12 provable + 3 pure)`);
    assert.equal(provable.length, 12, `${version} must pin 12 provable circuits`);
    for (const [name, pin] of pins) {
      if (pin.proof) {
        assert.equal(
          pin.keyLocation,
          `acc/${version}/${name}`,
          `${version}/${name}: keyLocation must be the extension-free, version-scoped reference`,
        );
        for (const part of ['zkir', 'bzkir', 'verifierKey', 'proverKey']) {
          assert.match(
            pin.hashes?.[part] ?? '',
            /^[0-9a-f]{64}$/,
            `${version}/${name}: the ${part} hash must be committed`,
          );
        }
      } else {
        assert.equal(pin.keyLocation, undefined, `${name} is pure — it must carry no keyLocation`);
        assert.equal(pin.hashes, undefined, `${name} is pure — it must carry no hashes`);
      }
    }
  }
});

test('resolveBinding must reject versions outside the supported set', () => {
  assert.throws(
    () => resolveBinding('9.9.9-nonexistent'),
    UnsupportedBindingError,
    'an unknown version must throw UnsupportedBindingError',
  );
  assert.equal(resolveBinding(BINDING_VERSION), ACC_REGISTRY.versions[BINDING_VERSION]);
});

test('detectDeployedVersion must recover a version from its verifier-key hashes', () => {
  const binding = resolveBinding(BINDING_VERSION);
  const verifierHashes = Object.values(binding.circuits)
    .filter((pin) => pin.hashes)
    .map((pin) => pin.hashes.verifierKey);
  assert.equal(detectDeployedVersion(verifierHashes), BINDING_VERSION);
  assert.equal(detectDeployedVersion([]), null, 'no evidence must detect nothing');
  const tampered = ['0'.repeat(64), ...verifierHashes.slice(1)];
  assert.equal(detectDeployedVersion(tampered), null, 'a foreign key set must detect nothing');
});

test('the commitment pure circuits the deploy caller needs must be present', () => {
  for (const name of ['derive_device_commitment', 'derive_recovery_commitment']) {
    const pin = resolveBinding(BINDING_VERSION).circuits[name];
    assert.ok(pin, `${name} must be in the current binding`);
    assert.equal(pin.pure, true, `${name} must be pure`);
  }
});

test('every locally built artefact version must match its committed hashes', (t) => {
  let verified = 0;
  for (const version of SUPPORTED_BINDINGS) {
    const dir = new URL(`../packages/contract/artefact/${version}/`, import.meta.url);
    if (!existsSync(dir)) continue;
    verified += 1;
    const binding = resolveBinding(version);
    const check = (/** @type {string} */ rel, /** @type {string} */ expected) => {
      const actual = createHash('sha256')
        .update(readFileSync(new URL(rel, dir)))
        .digest('hex');
      assert.equal(actual, expected, `${version}/${rel} must match its committed hash`);
    };
    for (const [name, pin] of Object.entries(binding.circuits)) {
      if (!pin.proof || !pin.hashes) continue;
      check(`zkir/${name}.zkir`, pin.hashes.zkir);
      check(`zkir/${name}.bzkir`, pin.hashes.bzkir);
      check(`keys/${name}.verifier`, pin.hashes.verifierKey);
      check(`keys/${name}.prover`, pin.hashes.proverKey);
    }
    for (const [rel, expected] of Object.entries(binding.moduleHashes)) check(rel, expected);
  }
  if (verified === 0) {
    t.skip(
      'no artefact built locally — run `pnpm run build:artefact` (needs compact + ../passport)',
    );
  }
});

test('the TypeScript mirror must agree with the canonical registry JSON', async () => {
  const { $generatedBy, schemaVersion, ...json } = JSON.parse(
    readFileSync(registryJsonUrl, 'utf8'),
  );
  assert.equal($generatedBy, 'scripts/build-acc-artefact.mjs', 'the JSON must carry provenance');
  assert.equal(schemaVersion, 1, 'the JSON must carry its schema version');
  assert.deepEqual(
    json,
    structuredClone(ACC_REGISTRY),
    'manifest.generated.ts must mirror acc-versions.generated.json exactly',
  );
});

test('resolveBinding must reject prototype keys, and the registry must be frozen', () => {
  for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    assert.throws(
      () => resolveBinding(key),
      UnsupportedBindingError,
      `"${key}" must be rejected, not resolved from the prototype chain`,
    );
  }
  assert.ok(Object.isFrozen(ACC_REGISTRY), 'the registry must be frozen at runtime');
  assert.ok(
    Object.isFrozen(resolveBinding(BINDING_VERSION).circuits),
    'resolved entries must be deep-frozen — they are the integrity anchor',
  );
});

test('detectDeployedVersion must normalise input and reject subsets and supersets', () => {
  const binding = resolveBinding(BINDING_VERSION);
  const hashes = Object.values(binding.circuits)
    .filter((pin) => pin.hashes)
    .map((pin) => pin.hashes.verifierKey);
  const shouty = hashes.map((h) => `0x${h.toUpperCase()}`);
  assert.equal(detectDeployedVersion(shouty), BINDING_VERSION, 'hex case and 0x must not matter');
  assert.equal(detectDeployedVersion(hashes.slice(1)), null, 'a subset must detect nothing');
  assert.equal(
    detectDeployedVersion([...hashes, 'f'.repeat(64)]),
    null,
    'a superset must detect nothing',
  );
});

test('detection ties must prefer current, then the first supported version', () => {
  const vk = (/** @type {string} */ n) => ({
    proof: true,
    pure: false,
    hashes: { verifierKey: n.repeat(64) },
  });
  const twin = { circuits: { a: vk('a'), b: vk('b') } };
  const registry = { current: 'v2', versions: { v1: twin, v2: twin, v3: twin } };
  const observed = ['a'.repeat(64), 'b'.repeat(64)];
  assert.equal(detectDeployedVersion(observed, registry), 'v2', 'ties must prefer current');
  const elsewhere = { current: 'v9', versions: { v1: twin, v2: twin } };
  assert.equal(
    detectDeployedVersion(observed, elsewhere),
    'v1',
    'without a current match, the first supported version must win',
  );
});
