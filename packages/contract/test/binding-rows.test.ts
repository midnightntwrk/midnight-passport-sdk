import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DOC, renderRows, withRows } from './binding-rows.js';

test('the binding rows of docs/compatibility.md are the render of BINDINGS', async () => {
  const doc = await readFile(DOC, 'utf8');
  assert.equal(doc, withRows(doc, await renderRows()));
});

test('a row with no manifest in generated/ fails the whole render', async () => {
  await assert.rejects(renderRows([{ manifestHash: '0'.repeat(64), status: 'current' }]));
});
