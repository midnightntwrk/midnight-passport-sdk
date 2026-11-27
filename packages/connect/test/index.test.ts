import { test } from 'node:test';
import assert from 'node:assert/strict';

test('connect exports the prover consent gate', async () => {
  const entry = await import('@midnight-ntwrk/mn-passport-connect');
  assert.deepEqual(Object.keys(entry).sort(), [
    'ProverConsentDeclinedError',
    'ProverConsentRecordError',
    'proverDisclosure',
    'storeConsentRecord',
    'withProverConsent',
  ]);
});
