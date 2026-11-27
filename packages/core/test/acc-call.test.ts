import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ContractOperation, ContractState } from '@midnight-ntwrk/compact-runtime';
import {
  MANIFEST_FILE,
  openAccArtifact,
  type AccArtifact,
} from '@midnight-ntwrk/mn-passport-contract';
import { PassportError, UpstreamError } from '@midnight-ntwrk/mn-passport-core';
import {
  AccountStateError,
  CircuitNotDeployedError,
  buildAccCall,
  checkAccCircuits,
  type AccCallInput,
} from '@midnight-ntwrk/mn-passport-core/chain';

const MANIFEST = new URL('../../contract/generated/passport-manifest.json', import.meta.url);
const dir = process.env.ACC_ARTIFACT_DIR;

async function artifact(): Promise<{ artifact: AccArtifact; reads: string[] }> {
  const reads: string[] = [];
  const read = async (path: string): Promise<Uint8Array> => {
    reads.push(path);
    if (path === MANIFEST_FILE) return new Uint8Array(await readFile(MANIFEST));
    return new Uint8Array(await readFile(join(dir ?? assert.fail('no artifact dir'), path)));
  };
  return { artifact: await openAccArtifact(read), reads };
}

const hex32 = '00'.repeat(32);

function input(a: AccArtifact, bytes: Uint8Array, over: Partial<AccCallInput> = {}): AccCallInput {
  return {
    artifact: a,
    contract: class {
      readonly used: never = assert.fail('the module must not be used');
    },
    witnesses: {},
    state: { address: hex32, bytes, block: { height: 1, hash: hex32 } },
    ledgerParameters: new Uint8Array(),
    zswapChainState: new Uint8Array(),
    circuit: 'activate_initial_device_with_p256',
    args: [],
    coinPublicKey: hex32,
    encryptionPublicKey: hex32,
    networkId: 'undeployed',
    ttlSeconds: 60,
    ...over,
  };
}

test('a call to a circuit that is not on chain is refused before midnight-js or a key read', async () => {
  const { artifact: a, reads } = await artifact();
  await assert.rejects(
    buildAccCall(input(a, new ContractState().serialize())),
    (e: unknown) =>
      e instanceof PassportError &&
      e instanceof CircuitNotDeployedError &&
      e.circuit === 'activate_initial_device_with_p256' &&
      e.arm === 'p256',
  );
  assert.deepEqual(reads, [MANIFEST_FILE]);
});

test('a circuit that takes a signature can be refused before the prompt', async () => {
  const { artifact: a } = await artifact();
  await assert.rejects(
    checkAccCircuits(a, new ContractState().serialize(), ['issue_grant_with_p256']),
    (e: unknown) =>
      e instanceof CircuitNotDeployedError &&
      e.circuit === 'issue_grant_with_p256' &&
      e.arm === 'p256',
  );
});

test('bad state bytes give the core error, without the runtime text', async () => {
  const { artifact: a } = await artifact();
  await assert.rejects(
    buildAccCall(input(a, Uint8Array.of(1, 2, 3))),
    (e: unknown) => e instanceof AccountStateError && e.cause === undefined,
  );
});

const skip = !dir && 'set ACC_ARTIFACT_DIR to a compiled ACC directory';

test('a midnight-js failure leaves the builder as an UpstreamError', { skip }, async () => {
  const { artifact: a } = await artifact();
  const state = new ContractState();
  const op = new ContractOperation();
  op.verifierKey = await a.read('keys/activate_initial_device_with_p256.verifier');
  state.setOperation('activate_initial_device_with_p256', op);
  await assert.rejects(buildAccCall(input(a, state.serialize())), UpstreamError);
});
