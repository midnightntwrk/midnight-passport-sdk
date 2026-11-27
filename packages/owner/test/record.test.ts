import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRecord } from '@midnight-ntwrk/mn-passport-owner';
import { memoryStore } from './fake-chain.js';

test('a stored record that is changed or holds another address is refused', async () => {
  const store = memoryStore();
  const address = 'ab'.repeat(32);
  await store.set(`deploy:${address}`, Buffer.from('{"version":1}'));
  await assert.rejects(loadRecord(store, address), { code: 'DEPLOY_RECORD_INVALID' });
  await store.set(`deploy:${address}`, Buffer.from('not json'));
  await assert.rejects(loadRecord(store, address), { code: 'DEPLOY_RECORD_INVALID' });
  assert.equal(await loadRecord(store, 'cd'.repeat(32)), undefined);
});
