import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';

test('no entry export is an Effect value', async () => {
  const entry: Record<string, unknown> = await import('@midnight-ntwrk/mn-passport-core');
  assert.ok(Object.keys(entry).length > 0);
  assert.deepEqual(
    Object.keys(entry).filter((key) => Effect.isEffect(entry[key])),
    [],
  );
});
