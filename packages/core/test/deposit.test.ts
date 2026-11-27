import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ContractState } from '@midnight-ntwrk/compact-runtime';
import { MANIFEST_FILE, openAccArtifact } from '@midnight-ntwrk/mn-passport-contract';
import type { CallInputs, TransactionStatus } from '@midnight-ntwrk/mn-passport-core';
import {
  AccountStateError,
  CircuitNotDeployedError,
  DepositFailedError,
  DepositTargetError,
  buildDeposit,
  requireDeposited,
  type Deposit,
  type DepositInput,
} from '@midnight-ntwrk/mn-passport-core/chain';

const MANIFEST = new URL('../../contract/generated/passport-manifest.json', import.meta.url);
const artifact = await openAccArtifact(async (path) => {
  assert.equal(path, MANIFEST_FILE, 'a refusal reads only the manifest');
  return new Uint8Array(await readFile(MANIFEST));
});
const hex32 = '00'.repeat(32);
const block = { height: 1, hash: hex32 };
const color = new Uint8Array(32).fill(7);

const input = (deposit: Deposit, inputs: CallInputs | undefined, reads: string[] = []) =>
  ({
    artifact,
    contract: class {
      readonly used: never = assert.fail('the module must not be used');
    },
    ledger: () => assert.fail('the ledger must not be decoded'),
    indexer: {
      callInputs: (address) => {
        reads.push(address);
        return Promise.resolve(inputs);
      },
    },
    address: 'ab'.repeat(32),
    deposit,
    coinPublicKey: hex32,
    encryptionPublicKey: hex32,
    networkId: 'undeployed',
    ttlSeconds: 60,
  }) satisfies DepositInput;

const inputsOf = (bytes: Uint8Array): CallInputs => ({
  state: { address: 'ab'.repeat(32), bytes, block },
  ledgerParameters: new Uint8Array(),
  zswapChainState: new Uint8Array(),
  block,
});

test('a deposit worth 0 or 2^128 is refused before any indexer read', async () => {
  const reads: string[] = [];
  for (const value of [0n, 1n << 128n, -1n]) {
    await assert.rejects(
      buildDeposit(input({ kind: 'shielded', color, value }, undefined, reads)),
      RangeError,
    );
    await assert.rejects(
      buildDeposit(input({ kind: 'unshielded', color, amount: value }, undefined, reads)),
      RangeError,
    );
  }
  await assert.rejects(
    buildDeposit(input({ kind: 'unshielded', color: new Uint8Array(31), amount: 1n }, undefined)),
    RangeError,
  );
  assert.deepEqual(reads, []);
});

test('no contract at the address is a DepositTargetError', async () => {
  await assert.rejects(
    buildDeposit(input({ kind: 'unshielded', color, amount: 5n }, undefined)),
    DepositTargetError,
  );
});

test('a contract that is not an account is refused before any transaction', async () => {
  const empty = inputsOf(new ContractState().serialize());
  await assert.rejects(
    buildDeposit(input({ kind: 'unshielded', color, amount: 5n }, empty)),
    (e: unknown) => e instanceof CircuitNotDeployedError && e.circuit === 'deposit_unshielded',
  );
  // The compiled `ledger` gives lazy getters, so a foreign state throws only on a field read.
  const text = 'invalid operation for type: tried to idx';
  await assert.rejects(
    buildDeposit({
      ...input({ kind: 'shielded', color, value: 5n }, empty),
      ledger: () => ({
        get enc_key(): never {
          throw new Error(text);
        },
      }),
    }),
    (e: unknown) => e instanceof AccountStateError && !e.message.includes(text),
  );
  await assert.rejects(
    buildDeposit({
      ...input({ kind: 'shielded', color, value: 5n }, empty),
      ledger: () => ({
        enc_key: new Uint8Array(31),
        inbox_count: 0n,
        inbox: { member: () => false, lookup: () => new Uint8Array(192) },
      }),
    }),
    AccountStateError,
  );
});

test('only a succeeded deposit passes, and partly-failed says the fee was paid', () => {
  const status = (over: Partial<TransactionStatus>): TransactionStatus => ({
    id: '00',
    level: 'final',
    block,
    result: 'succeeded',
    ...over,
  });
  requireDeposited(status({}));
  const feePaid = (s: TransactionStatus) => {
    try {
      requireDeposited(s);
    } catch (e) {
      assert.ok(e instanceof DepositFailedError);
      return e.feePaid;
    }
    return 'passed';
  };
  assert.equal(feePaid(status({ result: 'partly-failed' })), true);
  assert.equal(feePaid(status({ result: 'failed' })), false);
  assert.throws(
    () => requireDeposited(status({ level: 'in-block', result: undefined })),
    RangeError,
  );
});
