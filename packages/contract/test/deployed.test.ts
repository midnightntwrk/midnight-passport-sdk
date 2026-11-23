import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ContractOperation, ContractState } from '@midnight-ntwrk/compact-runtime';
import {
  CircuitNotDeployedError,
  MANIFEST_FILE,
  VerifierKeyMismatchError,
  armsOf,
  openAccArtifact,
  readDeployedCircuits,
  requireCircuits,
  type AccManifest,
} from '@midnight-ntwrk/mn-passport-contract';

const sha = (bytes: Uint8Array | string): string =>
  createHash('sha256').update(bytes).digest('hex');

async function openManifest(bytes: Uint8Array): Promise<AccManifest> {
  const read = async (path: string): Promise<Uint8Array> => {
    assert.equal(path, MANIFEST_FILE);
    return bytes;
  };
  return (await openAccArtifact(read, sha(bytes))).manifest;
}

const CIRCUITS = { shared: ['dep', 'rec'], p256: ['act', 'grant'], k256: ['k1'], jubjub: ['j1'] };
const ALL = Object.values(CIRCUITS).flat();
// A stand-in for the hash of each circuit's verifier key.
const KEY = Object.fromEntries(ALL.map((c) => [c, sha(c)]));

const manifest = (): Promise<AccManifest> =>
  openManifest(
    new TextEncoder().encode(
      JSON.stringify({
        schema: 1,
        source: { repository: 'r', commit: 'c', path: 'p' },
        toolchain: {
          compiler: '0.36.1',
          compilerCommit: 'a',
          language: 'l',
          runtime: 'r',
          zkir: 'z',
        },
        originLength: 21,
        circuits: CIRCUITS,
        waveOne: { jubjub: [], k256: [], p256: ['dep', 'act'] },
        files: Object.fromEntries(
          ALL.map((c) => [`keys/${c}.verifier`, { size: 1, sha256: KEY[c] }]),
        ),
      }),
    ),
  );

const onChain = (circuits: string[], keys: Record<string, string> = {}): Map<string, string> =>
  new Map(circuits.map((c) => [c, keys[c] ?? KEY[c] ?? sha(`other ${c}`)]));

test('the arms read is right for a wave-1, a one-arm, and a full account', async () => {
  const m = await manifest();
  const waveOne = armsOf(m, onChain(['dep', 'act']));
  assert.deepEqual(waveOne.arms, {
    shared: 'partial',
    jubjub: 'absent',
    k256: 'absent',
    p256: 'partial',
  });
  assert.deepEqual(waveOne.missing, {
    shared: ['rec'],
    jubjub: ['j1'],
    k256: ['k1'],
    p256: ['grant'],
  });
  const oneArm = armsOf(m, onChain(['dep', 'rec', 'act', 'grant']));
  assert.deepEqual(oneArm.arms, {
    shared: 'complete',
    jubjub: 'absent',
    k256: 'absent',
    p256: 'complete',
  });
  const full = armsOf(m, onChain([...ALL, 'not_in_the_build']));
  assert.deepEqual(full.arms, {
    shared: 'complete',
    jubjub: 'complete',
    k256: 'complete',
    p256: 'complete',
  });
  assert.deepEqual(full.changed, []);
});

test('a circuit with another key does not count, so a tampered arm is never complete', async () => {
  const m = await manifest();
  const report = armsOf(m, onChain(['dep', 'rec', 'act', 'grant'], { act: KEY.grant ?? '' }));
  assert.equal(report.arms.p256, 'partial');
  assert.deepEqual(report.changed, ['act']);
  assert.deepEqual(report.missing.p256, []);
});

test('a call to a missing circuit names the circuit and its arm', async () => {
  const m = await manifest();
  const d = onChain(['dep', 'act']);
  requireCircuits(m, d, ['act', 'dep']);
  const missing = (circuit: string, arm: string | undefined) => (e: unknown) =>
    e instanceof CircuitNotDeployedError && e.circuit === circuit && e.arm === arm;
  assert.throws(() => requireCircuits(m, d, ['act', 'k1']), missing('k1', 'k256'));
  assert.throws(() => requireCircuits(m, d, ['rec']), missing('rec', 'shared'));
  // On chain, but not in this build: there is no pinned key to check it against.
  assert.throws(
    () => requireCircuits(m, onChain(['extra']), ['extra']),
    missing('extra', undefined),
  );
});

test('a changed on-chain key is refused, even when the circuit is there', async () => {
  const m = await manifest();
  assert.throws(
    () => requireCircuits(m, onChain(['dep', 'act'], { act: KEY.dep ?? '' }), ['dep', 'act']),
    (e: unknown) => e instanceof VerifierKeyMismatchError && e.circuit === 'act',
  );
});

test('a caller cannot change a pinned verifier key after the load', async () => {
  const m = await manifest();
  const path = 'keys/act.verifier';
  assert.throws(() => {
    Reflect.apply(Map.prototype.set, m.files, [path, { size: 1, sha256: KEY.dep }]);
  }, TypeError);
  assert.throws(() => {
    Object.assign(m.files.get(path) ?? assert.fail(path), { sha256: KEY.dep });
  }, TypeError);
  assert.throws(
    () => requireCircuits(m, onChain(['act'], { act: KEY.dep ?? '' }), ['act']),
    VerifierKeyMismatchError,
  );
});

const dir = process.env.ACC_ARTIFACT_DIR;

test(
  'the read hashes each real on-chain key as the pin does, and skips a keyless operation',
  { skip: !dir && 'set ACC_ARTIFACT_DIR to a compiled ACC directory' },
  async () => {
    const m = await openManifest(
      new Uint8Array(
        await readFile(new URL('../generated/passport-manifest.json', import.meta.url)),
      ),
    );
    const state = new ContractState();
    for (const circuit of m.waveOne.p256) {
      const op = new ContractOperation();
      op.verifierKey = new Uint8Array(await readFile(join(dir ?? '', `keys/${circuit}.verifier`)));
      state.setOperation(circuit, op);
    }
    state.setOperation('keyless', new ContractOperation());
    const circuits = await readDeployedCircuits(state.serialize());
    assert.deepEqual([...circuits.keys()].sort(), [...m.waveOne.p256].sort());
    requireCircuits(m, circuits, m.waveOne.p256);
    assert.equal(armsOf(m, circuits).arms.p256, 'partial');
  },
);
