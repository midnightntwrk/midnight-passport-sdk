import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MANIFEST_FILE, openAccArtifact } from '@midnight-ntwrk/mn-passport-contract';
import {
  createWavePrice,
  packWaves,
  planBirth,
  type BirthPlanOptions,
  type WavePrice,
} from '@midnight-ntwrk/mn-passport-owner';
import { LEDGER_PARAMETERS_HEX } from './fixtures/ledger-parameters.js';

const manifest: BirthPlanOptions['manifest'] = {
  circuits: {
    shared: ['deposit_a', 'deposit_b', 'recover_a'],
    p256: ['activate_p256', 'withdraw_p256', 'grant_p256', 'add_p256', 'remove_p256'],
    jubjub: ['activate_jubjub'],
    k256: ['activate_k256'],
  },
  waveOne: { p256: ['deposit_a', 'activate_p256'], jubjub: [], k256: [] },
};

// Each circuit uses a tenth of a block.
const linear: WavePrice = (_kind, circuits) => circuits.length / 10;

test('a birth plan keeps the manifest wave 1 and packs only the birth set of that arm', () => {
  const plan = planBirth({ manifest, arm: 'p256', price: linear, headroom: 0.3 });
  assert.deepEqual(plan.waveOne, ['deposit_a', 'activate_p256']);
  assert.deepEqual(plan.updates, [
    ['deposit_b', 'recover_a', 'withdraw_p256'],
    ['grant_p256', 'add_p256', 'remove_p256'],
  ]);
});

test('a wave 1 or a single circuit over the headroom is refused', () => {
  assert.throws(() => planBirth({ manifest, arm: 'p256', price: linear, headroom: 0.15 }), {
    code: 'WAVE_TOO_LARGE',
  });
  const huge: WavePrice = (_kind, circuits) => (circuits.includes('b') ? 2 : 0.1);
  assert.throws(() => packWaves(['a', 'b'], huge, 0.5), {
    code: 'WAVE_TOO_LARGE',
    circuits: ['b'],
  });
});

const MANIFEST = new URL('../../contract/generated/passport-manifest.json', import.meta.url);
const dir = process.env.ACC_ARTIFACT_DIR;

test(
  'at node 2.1.101 parameters, the pinned p256 birth plans into waves that fit',
  { skip: !dir && 'set ACC_ARTIFACT_DIR to a compiled ACC directory' },
  async () => {
    const ledger = await import('@midnightntwrk/ledger-v9');
    const artifact = await openAccArtifact(async (path) =>
      path === MANIFEST_FILE
        ? new Uint8Array(await readFile(MANIFEST))
        : new Uint8Array(await readFile(join(dir ?? '', path))),
    );
    const birth = [...artifact.manifest.circuits.shared, ...artifact.manifest.circuits.p256];
    const verifierKeys = new Map<string, Uint8Array>();
    for (const circuit of birth) {
      verifierKeys.set(circuit, await artifact.read(`keys/${circuit}.verifier`));
    }
    const price = createWavePrice(ledger, {
      ledgerParameters: Buffer.from(LEDGER_PARAMETERS_HEX, 'hex'),
      networkId: 'undeployed',
      verifierKeys,
    });
    const plan = planBirth({ manifest: artifact.manifest, arm: 'p256', price });
    assert.deepEqual(plan, planBirth({ manifest: artifact.manifest, arm: 'p256', price }));
    assert.ok(price('deploy', plan.waveOne) <= 0.5);
    for (const wave of plan.updates) assert.ok(price('update', wave) <= 0.5);
    assert.deepEqual([...plan.waveOne, ...plan.updates.flat()].sort(), [...new Set(birth)].sort());
  },
);
