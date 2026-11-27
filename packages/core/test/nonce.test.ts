import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StaleNonceError, assertFresh } from '@midnight-ntwrk/mn-passport-core';

test('assertFresh passes while the ledger is at the signed nonce', () => {
  assert.doesNotThrow(() => {
    assertFresh({ authNonce: 7n }, 7n);
  });
});

test('assertFresh refuses a stale nonce and tells the caller to rebuild', () => {
  assert.throws(
    () => {
      assertFresh({ authNonce: 7n }, 8n);
    },
    (error: unknown) =>
      error instanceof StaleNonceError &&
      error.code === 'AUTH_NONCE_STALE' &&
      error.action === 'rebuild' &&
      error.signed === 7n &&
      error.current === 8n,
  );
});
