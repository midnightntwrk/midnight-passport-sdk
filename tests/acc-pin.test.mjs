import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  MANIFEST_PATH,
  VERIFIER_BYTE_BUDGET,
  buildManifest,
  pinOf,
  pinnedToolchain,
  waveOne,
} from '../scripts/acc-pin.mjs';
import {
  ACC_MANIFEST_SHA256,
  MANIFEST_FILE,
  openAccArtifact,
} from '../packages/contract/dist/index.js';
import { parseJson } from '../scripts/json.mjs';

const committed = await readFile(MANIFEST_PATH, 'utf8');
const manifest =
  /** @type {{ source: { commit: string }, toolchain: { compiler: string, runtime: string, zkir: string }, files: Record<string, { size: number }>, circuits: Record<string, string[]>, waveOne: Record<string, string[]> }} */ (
    parseJson(committed)
  );

test('the committed pin is the hash of the committed manifest bytes', () => {
  assert.equal(ACC_MANIFEST_SHA256, pinOf(committed));
});

test('the manifest compiler and runtime match the pin table', () => {
  const pinned = pinnedToolchain();
  assert.equal(manifest.toolchain.compiler, pinned.compiler);
  assert.equal(manifest.toolchain.runtime, pinned.runtime);
});

test('wave 1 is the longest prefix that fits, even when a later circuit would fit', () => {
  const sizes = new Map([
    ['deposit_unshielded', 6000],
    ['deposit_shielded', 6000],
    ['activate_initial_device_with_p256', VERIFIER_BYTE_BUDGET],
    ['withdraw_unshielded_with_p256', 1],
  ]);
  const wave = waveOne((circuit) => sizes.get(circuit) ?? 0, 'p256');
  assert.deepEqual(wave, ['deposit_unshielded', 'deposit_shielded']);
});

// CI has no artifact, so it checks that the manifest agrees with its own file table.
test('the manifest circuits and wave 1 follow from its own file table', () => {
  const verifiers = Object.keys(manifest.files).filter((p) => p.endsWith('.verifier'));
  const listed = Object.values(manifest.circuits).flat();
  assert.deepEqual(listed.map((c) => `keys/${c}.verifier`).sort(), verifiers.sort());
  /** @param {string} c */
  const size = (c) => manifest.files[`keys/${c}.verifier`]?.size ?? assert.fail(c);
  for (const [arm, wave] of Object.entries(manifest.waveOne)) {
    assert.deepEqual(wave, waveOne(size, arm));
  }
});

const dir = process.env.ACC_ARTIFACT_DIR;

test(
  'the local artifact gives the committed manifest, and every client file loads',
  { skip: !dir && 'set ACC_ARTIFACT_DIR to a compiled ACC directory' },
  async () => {
    assert.ok(dir);
    const built = buildManifest(dir, {
      commit: manifest.source.commit,
      zkir: manifest.toolchain.zkir,
    });
    assert.equal(built, committed);
    /** @param {string} path */
    const read = async (path) =>
      new Uint8Array(await readFile(path === MANIFEST_FILE ? MANIFEST_PATH : join(dir, path)));
    const artifact = await openAccArtifact(read);
    for (const path of Object.keys(manifest.files).filter((p) => !p.endsWith('.prover'))) {
      await artifact.read(path);
    }
  },
);
