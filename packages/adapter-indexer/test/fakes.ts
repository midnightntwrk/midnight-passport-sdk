import assert from 'node:assert/strict';
import { IndexerUnreachableError, type HttpResponse } from '@midnight-ntwrk/mn-passport-core';
import { expectRejection } from '@midnight-ntwrk/mn-passport-dev';

export const INDEXER_URL = 'https://indexer.test/graphql';

export const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
export const response = (status: number, body: Uint8Array): HttpResponse => ({
  status,
  headers: {},
  body,
});
export const ok = (value: unknown): HttpResponse => response(200, encode(JSON.stringify(value)));

export async function rejectsUnreachable(
  run: () => Promise<unknown>,
  reason: IndexerUnreachableError['reason'],
): Promise<void> {
  const error = await expectRejection(run, 'IndexerUnreachableError');
  assert.ok(error instanceof IndexerUnreachableError);
  assert.equal(error.reason, reason);
}
