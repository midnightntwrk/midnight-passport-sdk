import { test } from 'node:test';
import assert from 'node:assert/strict';

test('the entry exports the factory, the key location parser, and the four prover errors', async () => {
  const entry = await import('@midnight-ntwrk/mn-passport-adapter-prover-remote');
  assert.deepEqual(Object.keys(entry).sort(), [
    'ProverBusyError',
    'ProverRejectedError',
    'ProverUnauthorizedError',
    'ProverUnavailableError',
    'parseKeyLocation',
    'remoteProver',
  ]);
});
