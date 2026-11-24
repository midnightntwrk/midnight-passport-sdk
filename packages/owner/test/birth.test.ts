import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv, generateKeyPairSync, hkdfSync, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as ledger from '@midnightntwrk/ledger-v9';
import { MANIFEST_FILE, openAccArtifact } from '@midnight-ntwrk/mn-passport-contract';
import {
  deployTransaction,
  Kernel,
  loadRecord,
  openAuthority,
  openViewing,
  prepareBirth,
  saveRecord,
  type AccBirthModule,
  type BirthOptions,
  type BirthPasskey,
  type BirthRecord,
  type PrfResult,
} from '@midnight-ntwrk/mn-passport-owner';
import { openViewingKey, type PrfInputs } from '../dist/kernel/index.js';
import { memoryStore, verifierKey as fixtureKey } from './fake-chain.js';

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
const prf = (seed: number): Uint8Array => Uint8Array.from({ length: 32 }, (_, i) => i + seed);

interface Prompts {
  readonly asked: (keyof PrfInputs)[][];
}

function passkey(prompts: Prompts, created: PrfResult | undefined, seed = 0): BirthPasskey {
  const jwk = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({
    format: 'jwk',
  });
  return {
    credentialId: Uint8Array.of(7, 7, 7),
    publicKey: Buffer.concat([
      Buffer.from(jwk.x ?? '', 'base64url'),
      Buffer.from(jwk.y ?? '', 'base64url'),
    ]),
    policy: { rpIdHash: new Uint8Array(32).fill(1), origin: 'https://passport.test' },
    created,
    readPrf: async (inputs) => {
      prompts.asked.push(Object.keys(inputs) as (keyof PrfInputs)[]);
      return {
        ...(inputs.first && { first: prf(seed) }),
        ...(inputs.second && { second: prf(seed + 1) }),
        userVerified: true,
      };
    },
  };
}

// Runs no circuit. The test with the compiled module is below.
const stubModule: AccBirthModule = {
  contract: {
    initialState: async () => ({
      currentContractState: { serialize: () => new ledger.ContractState().serialize() },
    }),
  },
  pureCircuits: { derive_boot_commitment_with_p256: () => new Uint8Array(32) },
};

// Opened here with node:crypto, so that the check does not trust the code under test.
function authoritySecret(record: BirthRecord): string {
  const wrap = Buffer.from(record.authority.wrap, 'hex');
  const aes = hkdfSync(
    'sha256',
    prf(0),
    new Uint8Array(0),
    'midnight:passport:authority:wrap:v1',
    32,
  );
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(aes), wrap.subarray(1, 13));
  decipher.setAAD(Buffer.from(record.authority.publicKey, 'hex'));
  decipher.setAuthTag(wrap.subarray(-16));
  return hex(Buffer.concat([decipher.update(wrap.subarray(13, -16)), decipher.final()]));
}

const options = (over: Partial<BirthOptions>): BirthOptions => ({
  ledger,
  kernel: new Kernel(),
  module: stubModule,
  passkey: passkey({ asked: [] }, undefined),
  plan: { waveOne: ['activate_initial_device_with_p256'], updates: [] },
  verifierKey: fixtureKey,
  networkId: 'undeployed',
  randomBytes: (n) => new Uint8Array(randomBytes(n)),
  ...over,
});

test('a birth record holds no secret, and a resend of its deploy keeps the address', async () => {
  const prompts: Prompts = { asked: [] };
  const kernel = new Kernel();
  const created = { first: prf(0), second: prf(1), userVerified: true };
  const birth = await prepareBirth(options({ kernel, passkey: passkey(prompts, created) }));
  assert.deepEqual(prompts.asked, [], 'the create gave the PRF, so no second prompt');
  kernel.releaseSecret(birth.viewing);

  const { record } = birth;
  const viewing = await openViewingKey(prf(1), {
    publicKey: Buffer.from(record.viewing.publicKey, 'hex'),
    wrap: Buffer.from(record.viewing.wrap, 'hex'),
  });
  assert.ok(viewing);
  const text = JSON.stringify(record);
  for (const secret of [hex(prf(0)), hex(prf(1)), hex(viewing), authoritySecret(record)]) {
    assert.ok(!text.includes(secret));
  }

  const store = memoryStore();
  await saveRecord(store, record);
  assert.deepEqual(await loadRecord(store, record.address), JSON.parse(text));

  const tx = ledger.Transaction.deserialize(
    'signature',
    'pre-proof',
    'pre-binding',
    deployTransaction(ledger, record, 120_000),
  );
  const deploy = [...(tx.intents?.values() ?? [])].flatMap((i) => i.actions)[0];
  assert.ok(deploy instanceof ledger.ContractDeploy);
  assert.equal(deploy.address, record.address);
  assert.deepEqual(deploy.initialState.maintenanceAuthority.committee, [
    birth.authority.verifyingKey,
  ]);
});

test('a create without a PRF result costs one prompt for both inputs', async () => {
  const prompts: Prompts = { asked: [] };
  await prepareBirth(options({ passkey: passkey(prompts, undefined) }));
  assert.deepEqual(prompts.asked, [['first', 'second']]);
});

test('a later session asks one PRF input each for the authority and the viewing secret', async () => {
  const { record } = await prepareBirth(options({ passkey: passkey({ asked: [] }, undefined) }));
  const prompts: Prompts = { asked: [] };
  const authority = await openAuthority(ledger, passkey(prompts, undefined), record);
  assert.equal(authority.verifyingKey.value, record.authority.publicKey);
  const kernel = new Kernel();
  kernel.releaseSecret(await openViewing(kernel, passkey(prompts, undefined), record));
  assert.deepEqual(prompts.asked, [['first'], ['second']]);

  // A passkey whose PRF value changed gives other keys.
  await assert.rejects(openAuthority(ledger, passkey(prompts, undefined, 5), record), {
    code: 'AUTHORITY_KEY_MISMATCH',
  });
  await assert.rejects(openViewing(kernel, passkey(prompts, undefined, 5), record), {
    code: 'VIEWING_WRAP_MISMATCH',
  });
});

const MANIFEST = new URL('../../contract/generated/passport-manifest.json', import.meta.url);
const dir = process.env.ACC_ARTIFACT_DIR;

test(
  'with the compiled module, the deploy holds only wave 1 and the record salt opens its boot',
  { skip: !dir && 'set ACC_ARTIFACT_DIR to a compiled ACC directory' },
  async () => {
    const artifact = await openAccArtifact(async (path) =>
      path === MANIFEST_FILE
        ? new Uint8Array(await readFile(MANIFEST))
        : new Uint8Array(await readFile(join(dir ?? '', path))),
    );
    // Imported from beside this test, so that it resolves compact-runtime from the workspace.
    const copy = new URL('acc-module.js', import.meta.url);
    await writeFile(copy, await artifact.read('contract/index.js'));
    const compiled = (await import(copy.href)) as {
      Contract: new (witnesses: object) => AccBirthModule['contract'];
      pureCircuits: AccBirthModule['pureCircuits'];
      ledger(data: unknown): { boot: Uint8Array };
    };
    const key = passkey({ asked: [] }, undefined);
    const { record } = await prepareBirth(
      options({
        module: {
          contract: new compiled.Contract({ held_coin: () => assert.fail('no coin read') }),
          pureCircuits: compiled.pureCircuits,
        },
        passkey: key,
        plan: { waveOne: ['deposit_unshielded', 'activate_initial_device_with_p256'], updates: [] },
        verifierKey: (circuit) => artifact.read(`keys/${circuit}.verifier`),
      }),
    );
    const tx = ledger.Transaction.deserialize(
      'signature',
      'pre-proof',
      'pre-binding',
      Buffer.from(record.deploy, 'hex'),
    );
    const deploy = [...(tx.intents?.values() ?? [])].flatMap((i) => i.actions)[0];
    assert.ok(deploy instanceof ledger.ContractDeploy);
    // The constructor's state lists every circuit with no key; none of those may ship.
    assert.deepEqual(deploy.initialState.operations().map(String).sort(), [
      'activate_initial_device_with_p256',
      'deposit_unshielded',
    ]);
    // The module reads state through compact-runtime, a different WASM instance from the ledger's.
    const runtime = await import('@midnight-ntwrk/compact-runtime');
    const boot = compiled.ledger(
      runtime.ContractState.deserialize(deploy.initialState.serialize()).data,
    ).boot;
    assert.deepEqual(
      compiled.pureCircuits.derive_boot_commitment_with_p256(
        Buffer.from(record.salt ?? '', 'hex'),
        {
          x: BigInt(`0x${hex(key.publicKey.subarray(0, 32))}`),
          y: BigInt(`0x${hex(key.publicKey.subarray(32))}`),
          identity: false,
        },
        { rp_id_hash: key.policy.rpIdHash, origin: Buffer.from(key.policy.origin) },
      ),
      boot,
    );
  },
);
