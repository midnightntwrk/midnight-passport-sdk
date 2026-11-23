import { test } from 'node:test';
import assert from 'node:assert/strict';

test('the entry exports createIndexer only, and an indexer has only the seam methods', async () => {
  const entry = await import('@midnight-ntwrk/mn-passport-adapter-indexer');
  assert.deepEqual(Object.keys(entry), ['createIndexer']);
  const indexer = entry.createIndexer({
    indexerUrl: 'https://indexer.test/graphql',
    http: () => Promise.reject(new Error('no request expected')),
  });
  assert.deepEqual(Object.keys(indexer).sort(), [
    'callInputs',
    'contractState',
    'ledgerParameters',
    'transaction',
    'watchContract',
    'watchTransaction',
  ]);
});
