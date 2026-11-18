import { test } from 'node:test';
import assert from 'node:assert/strict';

test('the entry exports the adapters only', async () => {
  const entry = await import('@midnight-ntwrk/mn-passport-adapter-broadcast');
  assert.deepEqual(Object.keys(entry).sort(), [
    'SponsorAlteredError',
    'nodeBroadcast',
    'sponsorFees',
  ]);
});
