import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CancelledError,
  IndexerUnreachableError,
  MetadataConflictError,
  MetadataTooLargeError,
  NetworkError,
  PassportError,
  TimeoutError,
} from '@midnight-ntwrk/mn-passport-core';

test('each seam error is a PassportError with a fixed tag, code, and fields', () => {
  const cases: [PassportError, string, string, Record<string, unknown>][] = [
    [new CancelledError('user'), 'CancelledError', 'CANCELLED', { by: 'user' }],
    [new TimeoutError(250), 'TimeoutError', 'TIMEOUT', { afterMs: 250 }],
    [
      new IndexerUnreachableError('status'),
      'IndexerUnreachableError',
      'INDEXER_UNREACHABLE',
      { reason: 'status' },
    ],
    [
      new MetadataConflictError('acc'),
      'MetadataConflictError',
      'METADATA_CONFLICT',
      { namespace: 'acc' },
    ],
    [
      new MetadataTooLargeError(3000, 2048),
      'MetadataTooLargeError',
      'METADATA_TOO_LARGE',
      { bytes: 3000, maxBytes: 2048 },
    ],
    [new NetworkError(), 'NetworkError', 'NETWORK_FAILED', {}],
  ];
  for (const [error, tag, code, fields] of cases) {
    assert.ok(error instanceof PassportError);
    assert.deepEqual([error._tag, error.name, error.code], [tag, tag, code]);
    for (const [key, value] of Object.entries(fields)) assert.equal(Reflect.get(error, key), value);
  }
  assert.deepEqual(Object.keys(new NetworkError()).sort(), ['_tag', 'code', 'name']);
});
