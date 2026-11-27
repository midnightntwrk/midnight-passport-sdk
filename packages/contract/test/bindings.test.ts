import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  ACC_MANIFEST_SHA256,
  AmbiguousBindingError,
  ArtifactPinError,
  MANIFEST_FILE,
  UnknownBindingError,
  type BindingRow,
} from '@midnight-ntwrk/mn-passport-contract';
import { identifyIn } from '../dist/bindings.js';

interface Manifest {
  circuits: Record<'shared' | 'jubjub' | 'k256' | 'p256', string[]>;
  waveOne: Record<'jubjub' | 'k256' | 'p256', string[]>;
  files: Record<string, { size: number; sha256: string }>;
}

const sha = (bytes: Uint8Array | string): string =>
  createHash('sha256').update(bytes).digest('hex');
const PIN_BYTES = new Uint8Array(
  await readFile(new URL('../generated/passport-manifest.json', import.meta.url)),
);
const parse = (bytes: Uint8Array): Manifest =>
  JSON.parse(new TextDecoder().decode(bytes)) as Manifest;
const key = (m: Manifest, circuit: string): string =>
  m.files[`keys/${circuit}.verifier`]?.sha256 ?? assert.fail(`no key for ${circuit}`);

// A later build changes these keys of the pin and adds a mode-1 activation.
const CHANGED = [
  'activate_initial_device_with_jubjub',
  'activate_initial_device_with_k256',
  'activate_initial_device_with_p256',
  'recover_finalise',
];
const PASSKEY = 'activate_initial_passkey';

function fixtureBytes(): Uint8Array {
  const m = parse(PIN_BYTES);
  for (const c of [...CHANGED, PASSKEY])
    m.files[`keys/${c}.verifier`] = { size: 1, sha256: sha(c) };
  m.circuits.shared = [PASSKEY, ...m.circuits.shared];
  return new TextEncoder().encode(JSON.stringify(m));
}

function setup(bootBytes: Uint8Array) {
  const boot = sha(bootBytes);
  const bytes = new Map([
    [ACC_MANIFEST_SHA256, PIN_BYTES],
    [boot, bootBytes],
  ]);
  const table: BindingRow[] = [
    { manifestHash: ACC_MANIFEST_SHA256, status: 'supported' },
    { manifestHash: boot, status: 'current' },
  ];
  const readFor = (row: BindingRow) => async (path: string) => {
    assert.equal(path, MANIFEST_FILE);
    return bytes.get(row.manifestHash) ?? assert.fail('unknown row');
  };
  const account = (m: Uint8Array, circuits: readonly string[]) =>
    new Map(circuits.map((c) => [c, key(parse(m), c)]));
  const identify = (onChain: ReadonlyMap<string, string>) => identifyIn(table, onChain, readFor);
  return { boot, account, identify, readFor, table };
}

const pin = parse(PIN_BYTES);
const DEPOSITS = ['deposit_unshielded', 'deposit_shielded'];

test('each of two builds identifies its own wave-1 accounts, by the activation key', async () => {
  const { boot, account, identify } = setup(fixtureBytes());
  const onPin = await identify(account(PIN_BYTES, pin.waveOne.p256));
  assert.equal(onPin.artifact.binding.manifestHash, ACC_MANIFEST_SHA256);
  assert.equal(onPin.status, 'supported');
  assert.equal(onPin.arms.p256, 'partial');
  for (const wave of [pin.waveOne.p256, [...DEPOSITS, PASSKEY]]) {
    const onBoot = await identify(account(fixtureBytes(), wave));
    assert.equal(onBoot.artifact.binding.manifestHash, boot);
    assert.equal(onBoot.status, 'current');
  }
});

test('a one-arm account is identified, and its missing arms are listed', async () => {
  const { account, identify } = setup(fixtureBytes());
  const id = await identify(account(PIN_BYTES, [...pin.circuits.shared, ...pin.circuits.p256]));
  assert.deepEqual(
    [id.arms.shared, id.arms.p256, id.arms.k256],
    ['complete', 'complete', 'absent'],
  );
  assert.deepEqual(id.missing.k256, pin.circuits.k256);
});

test('an account with only the keys that both builds share is ambiguous, never a pick', async () => {
  const { boot, account, identify } = setup(fixtureBytes());
  await assert.rejects(
    identify(account(PIN_BYTES, DEPOSITS)),
    (e: unknown) =>
      e instanceof AmbiguousBindingError &&
      e.code === 'BINDING_AMBIGUOUS' &&
      e.manifestHashes.join() === [ACC_MANIFEST_SHA256, boot].join(),
  );
});

test('a foreign key, a name that the build does not list, or no key is unknown', async () => {
  const { account, identify } = setup(fixtureBytes());
  const foreign = account(PIN_BYTES, pin.waveOne.p256).set('deposit_unshielded', sha('x'));
  // Without the extra name, the account is a pin account.
  const unlisted = account(PIN_BYTES, pin.waveOne.p256).set(PASSKEY, sha(PASSKEY));
  for (const onChain of [foreign, unlisted, new Map<string, string>()]) {
    await assert.rejects(identify(onChain), UnknownBindingError);
  }
});

test('a row whose reader serves another manifest fails the whole call', async () => {
  const { account, readFor, table } = setup(fixtureBytes());
  const swapped = (row: BindingRow) => readFor(table.find((r) => r !== row) ?? row);
  await assert.rejects(
    identifyIn(table, account(PIN_BYTES, pin.waveOne.p256), swapped),
    ArtifactPinError,
  );
});

const bootFile = process.env.PASSPORT_BOOTSTRAP_MANIFEST;

test(
  'a real later-build manifest still differs from the pin in each activation key',
  { skip: !bootFile && 'set PASSPORT_BOOTSTRAP_MANIFEST to the manifest of the later build' },
  async () => {
    const real = new Uint8Array(await readFile(bootFile ?? ''));
    const { boot, account, identify } = setup(real);
    for (const arm of ['jubjub', 'k256', 'p256'] as const) {
      const id = await identify(account(PIN_BYTES, pin.waveOne[arm]));
      assert.equal(id.artifact.binding.manifestHash, ACC_MANIFEST_SHA256);
    }
    const id = await identify(account(real, [...DEPOSITS, PASSKEY]));
    assert.equal(id.artifact.binding.manifestHash, boot);
    await assert.rejects(identify(account(real, DEPOSITS)), AmbiguousBindingError);
  },
);
