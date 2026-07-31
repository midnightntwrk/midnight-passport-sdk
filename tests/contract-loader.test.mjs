// Guards the FS-0.2 T3 integrity loader: every byte loadArtefact returns
// matched its committed hash; mismatches throw ZkArtifactIntegrityError
// with the taxonomy fields; unknown circuits and unsupported versions fail
// with their own typed errors. The fs-backed source lives here (tests are
// Node); browsers supply a fetch-backed one — the loader itself is
// platform-neutral.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const {
  ACC_MODULE_FILE,
  BINDING_VERSION,
  UnknownCircuitError,
  UnsupportedBindingError,
  ZkArtifactIntegrityError,
  loadArtefact,
} = await import(new URL('../packages/contract/dist/index.js', import.meta.url).href);

const artefactRoot = new URL(`../packages/contract/artefact/${BINDING_VERSION}/`, import.meta.url);
const fsSource = (/** @type {string} */ rel) =>
  readFile(new URL(rel, artefactRoot)).then((buffer) => new Uint8Array(buffer));

test('loadArtefact must reject an unsupported version before fetching anything', async () => {
  let fetched = 0;
  const spy = async () => {
    fetched += 1;
    return new Uint8Array();
  };
  await assert.rejects(
    loadArtefact(spy, { version: '9.9.9-nonexistent' }),
    UnsupportedBindingError,
    'the supported-set gate must fire first',
  );
  assert.equal(fetched, 0, 'nothing must be fetched for an unsupported version');
});

test('loadArtefact must reject a circuit outside the binding inventory', async () => {
  await assert.rejects(
    loadArtefact(fsSource, { circuits: ['not_a_circuit'] }),
    (/** @type {InstanceType<typeof UnknownCircuitError>} */ error) => {
      assert.equal(error.code, 'UNKNOWN_CIRCUIT');
      assert.equal(error.reason, 'absent', 'a missing name must be reported as absent');
      return true;
    },
    'unknown circuits must fail with their typed error',
  );
  await assert.rejects(
    loadArtefact(fsSource, { circuits: ['derive_device_commitment'] }),
    (/** @type {InstanceType<typeof UnknownCircuitError>} */ error) => {
      assert.equal(error.reason, 'pure', 'a pure circuit must be reported as pure, not absent');
      assert.match(error.message, /generated module/, 'the message must point at the module');
      return true;
    },
    'pure circuits have no artefact files and must say so',
  );
});

test('loadArtefact must verify against an injected registry (runs everywhere)', async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const goodHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const hashes = { zkir: goodHash, bzkir: goodHash, verifierKey: goodHash, proverKey: goodHash };
  const registry = {
    current: 'v-test',
    versions: {
      'v-test': {
        provisional: true,
        source: { path: 'account.compact', sha256: goodHash },
        toolchain: {},
        moduleHashes: /** @type {Record<string, string>} */ ({
          'contract/index.js': goodHash,
        }),
        circuits: { probe: { pure: false, proof: true, keyLocation: 'acc/v-test/probe', hashes } },
      },
    },
  };
  const constantSource = async () => bytes;
  const loaded = await loadArtefact(constantSource, { registry });
  assert.equal(loaded.files.size, 4, 'three parts plus the module must verify');
  const evilSource = async () => new Uint8Array([9, 9, 9]);
  await assert.rejects(
    loadArtefact(evilSource, { registry }),
    ZkArtifactIntegrityError,
    'mismatching bytes must be rejected even without a local artefact',
  );
  /** @type {typeof registry} */
  const unpinned = structuredClone(registry);
  unpinned.versions['v-test'].moduleHashes = /** @type {Record<string, string>} */ ({});
  await assert.rejects(
    loadArtefact(constantSource, { registry: unpinned }),
    (/** @type {InstanceType<typeof ZkArtifactIntegrityError>} */ error) => {
      assert.equal(error.expected, '', 'a missing pin must be an integrity failure, not a skip');
      assert.equal(error.file, 'contract/index.js');
      return true;
    },
    'a requested file without a committed pin must fail loudly',
  );
});

test('loadArtefact must stop between fetches when the signal aborts', async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const goodHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const hashes = { zkir: goodHash, bzkir: goodHash, verifierKey: goodHash, proverKey: goodHash };
  const registry = {
    current: 'v-test',
    versions: {
      'v-test': {
        provisional: true,
        source: { path: 'account.compact', sha256: goodHash },
        toolchain: {},
        moduleHashes: { 'contract/index.js': goodHash },
        circuits: { probe: { pure: false, proof: true, keyLocation: 'acc/v-test/probe', hashes } },
      },
    },
  };
  const signal = { aborted: false, reason: new Error('caller aborted') };
  let calls = 0;
  const source = async () => {
    calls += 1;
    signal.aborted = true; // abort after the first fetch
    return bytes;
  };
  await assert.rejects(
    loadArtefact(source, { registry, signal }),
    /caller aborted/,
    'aborting must reject with the signal reason',
  );
  assert.equal(calls, 1, 'no further fetches must happen after the abort');
});

test('loadArtefact must verify and return exactly the requested bytes (skips when not built)', async (t) => {
  if (!existsSync(artefactRoot)) {
    t.skip('artefact not built locally — run `pnpm run build:artefact`');
    return;
  }
  const loaded = await loadArtefact(fsSource, { circuits: ['add_device'] });
  assert.equal(loaded.bindingVersion, BINDING_VERSION);
  const expected = [
    'zkir/add_device.zkir',
    'zkir/add_device.bzkir',
    'keys/add_device.verifier',
    ACC_MODULE_FILE,
  ];
  assert.deepEqual(
    [...loaded.files.keys()].sort(),
    expected.sort(),
    'exactly the requested parts must be returned',
  );
  const disk = await fsSource('keys/add_device.verifier');
  assert.deepEqual(
    loaded.files.get('keys/add_device.verifier'),
    disk,
    'returned bytes must be the verified source bytes',
  );
});

test('loadArtefact must load the full provable inventory by default (skips when not built)', async (t) => {
  if (!existsSync(artefactRoot)) {
    t.skip('artefact not built locally — run `pnpm run build:artefact`');
    return;
  }
  const loaded = await loadArtefact(fsSource);
  assert.equal(
    loaded.files.size,
    12 * 3 + 1,
    'the full provable inventory must be loaded (12 circuits × 3 parts + the module)',
  );
});

test('loadArtefact must throw ZkArtifactIntegrityError on tampered bytes and return nothing (skips when not built)', async (t) => {
  if (!existsSync(artefactRoot)) {
    t.skip('artefact not built locally — run `pnpm run build:artefact`');
    return;
  }
  // The verifier key is the §8 verify-plan case; the binary ZKIR and the
  // generated module carry the D-9 trust story.
  for (const target of ['keys/add_device.verifier', 'zkir/add_device.bzkir', ACC_MODULE_FILE]) {
    const tampering = async (/** @type {string} */ rel) => {
      const bytes = await fsSource(rel);
      if (rel === target) bytes[0] = (bytes[0] ?? 0) ^ 0xff;
      return bytes;
    };
    await assert.rejects(
      loadArtefact(tampering, { circuits: ['add_device'] }),
      (/** @type {InstanceType<typeof ZkArtifactIntegrityError>} */ error) => {
        assert.equal(error.name, 'ZkArtifactIntegrityError');
        assert.equal(error.code, 'ZK_ARTIFACT_INTEGRITY', 'the stable code must be carried');
        assert.equal(error.file, target, 'the failing file must be named');
        assert.match(error.expected, /^[0-9a-f]{64}$/);
        assert.match(error.actual, /^[0-9a-f]{64}$/);
        assert.notEqual(error.expected, error.actual);
        assert.equal(error.bindingVersion, BINDING_VERSION);
        return true;
      },
      `tampering with ${target} must be rejected`,
    );
  }
});

test('prover keys must be loadable on explicit request only (skips when not built)', async (t) => {
  if (!existsSync(artefactRoot)) {
    t.skip('artefact not built locally — run `pnpm run build:artefact`');
    return;
  }
  const loaded = await loadArtefact(fsSource, {
    circuits: ['add_device'],
    parts: ['proverKey'],
    module: false,
  });
  assert.deepEqual(
    [...loaded.files.keys()],
    ['keys/add_device.prover'],
    'only the requested prover key must be returned',
  );
});
