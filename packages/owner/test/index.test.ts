import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountConsentRecord } from '@midnight-ntwrk/mn-passport-owner';
import { memoryStore } from './fake-chain.js';

const accepted = { version: '1-draft', operator: 'Example Prover' };

test('each account keeps its own prover consent', { timeout: 2000 }, async () => {
  const store = memoryStore();
  await accountConsentRecord(store, 'a'.repeat(64)).write(accepted);
  assert.deepEqual(await accountConsentRecord(store, 'a'.repeat(64)).read(), accepted);
  assert.equal(await accountConsentRecord(store, 'b'.repeat(64)).read(), undefined);
  assert.deepEqual(await store.keys(), [`account/${'a'.repeat(64)}/prover-consent`]);
});

test('a malformed account address throws TypeError', () => {
  for (const bad of ['A'.repeat(64), 'a'.repeat(63), `${'a'.repeat(60)}/../`]) {
    assert.throws(() => accountConsentRecord(memoryStore(), bad), TypeError, bad);
  }
});
