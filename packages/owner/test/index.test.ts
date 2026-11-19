import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LocalStore } from '@midnight-ntwrk/mn-passport-core';
import { accountConsentRecord } from '@midnight-ntwrk/mn-passport-owner';

function mapStore(): LocalStore & { entries: Map<string, Uint8Array> } {
  const entries = new Map<string, Uint8Array>();
  return {
    entries,
    get: async (key) => entries.get(key),
    set: async (key, value) => void entries.set(key, value),
    delete: async (key) => void entries.delete(key),
    keys: async () => [...entries.keys()],
    wipe: async () => entries.clear(),
  };
}

const accepted = { version: '1-draft', operator: 'Example Prover' };

test('each account keeps its own prover consent', { timeout: 2000 }, async () => {
  const store = mapStore();
  await accountConsentRecord(store, 'a'.repeat(64)).write(accepted);
  assert.deepEqual(await accountConsentRecord(store, 'a'.repeat(64)).read(), accepted);
  assert.equal(await accountConsentRecord(store, 'b'.repeat(64)).read(), undefined);
  assert.deepEqual([...store.entries.keys()], [`account/${'a'.repeat(64)}/prover-consent`]);
});

test('a malformed account address throws TypeError', () => {
  for (const bad of ['A'.repeat(64), 'a'.repeat(63), `${'a'.repeat(60)}/../`]) {
    assert.throws(() => accountConsentRecord(mapStore(), bad), TypeError, bad);
  }
});
