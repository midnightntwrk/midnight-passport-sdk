// Guards the FS-0.2 T2 surface: the compatibility gate, the deploy-args
// shape (constructor order matters), and the module binder — including,
// when the artefact is built locally, binding the real generated module
// and deriving commitments with its pure circuits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const {
  AccModuleShapeError,
  BINDING_VERSION,
  UnsupportedBindingError,
  assertBindingCompatible,
  bindAccModule,
  buildDeployArgs,
} = await import(new URL('../packages/contract/dist/index.js', import.meta.url).href);

test('assertBindingCompatible must gate on the supported set', () => {
  assert.doesNotThrow(
    () => assertBindingCompatible(BINDING_VERSION),
    'the current version must pass its own gate',
  );
  assert.throws(
    () => assertBindingCompatible('9.9.9-nonexistent'),
    UnsupportedBindingError,
    'an unsupported version must be rejected at the gate',
  );
});

test('buildDeployArgs must order the constructor arguments as the contract declares', () => {
  const args = buildDeployArgs({ initialDeviceCommitment: 11n, recoveryCommitment: 22n });
  assert.equal(args.bindingVersion, BINDING_VERSION, 'new deploys must default to current');
  assert.deepEqual(
    args.constructorArgs,
    [11n, 22n],
    'order must be (initial_device_commitment, recovery_commitment)',
  );
  assert.throws(
    () => buildDeployArgs({ initialDeviceCommitment: 1n, recoveryCommitment: 2n }, 'nope'),
    UnsupportedBindingError,
    'deploying an unsupported binding must be rejected',
  );
});

test('bindAccModule must reject shapes that are not the generated ACC module', () => {
  for (const [candidate, why] of [
    [null, 'null'],
    [{}, 'empty object'],
    [{ Contract: class {}, ledger: () => ({}) }, 'missing pure circuits'],
    [
      {
        Contract: class {},
        ledger: () => ({}),
        pureCircuits: { derive_device_commitment: () => 0n },
      },
      'incomplete pure circuits',
    ],
  ]) {
    assert.throws(() => bindAccModule(candidate), AccModuleShapeError, `${why} must be rejected`);
  }
});

test('the real generated module must bind and derive commitments (skips when not built)', async (t) => {
  const entry = new URL(
    `../packages/contract/artefact/${BINDING_VERSION}/contract/index.js`,
    import.meta.url,
  );
  if (!existsSync(entry)) {
    t.skip('artefact not built locally — run `pnpm run build:artefact`');
    return;
  }
  const acc = bindAccModule(await import(entry.href));
  const secret = new Uint8Array(32).fill(7);
  const device = acc.pureCircuits.derive_device_commitment(secret);
  const recovery = acc.pureCircuits.derive_recovery_commitment(secret);
  assert.equal(typeof device, 'bigint', 'commitments must be Field values (bigint)');
  assert.equal(
    device,
    acc.pureCircuits.derive_device_commitment(new Uint8Array(32).fill(7)),
    'the same secret must derive the same commitment',
  );
  assert.notEqual(
    device,
    recovery,
    'device and recovery domains must derive different commitments from one secret',
  );
  const args = buildDeployArgs({ initialDeviceCommitment: device, recoveryCommitment: recovery });
  assert.deepEqual(
    args.constructorArgs,
    [device, recovery],
    'derived commitments must flow into the constructor in contract order',
  );
});

test("the dev runtime pin must equal the current binding's recorded runtime version", async () => {
  const { resolveBinding } = await import(
    new URL('../packages/contract/dist/index.js', import.meta.url).href
  );
  const root = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(
    root.devDependencies['@midnight-ntwrk/compact-runtime'],
    resolveBinding(BINDING_VERSION).toolchain.runtimeVersion,
    'the compatibility matrix must hold: dev runtime pin = binding runtimeVersion (docs/compatibility.md)',
  );
});
