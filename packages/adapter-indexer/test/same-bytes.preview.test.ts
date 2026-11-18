import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HttpRequest, HttpResponse } from '@midnight-ntwrk/mn-passport-core';
import { readContractState } from '../dist/reads.js';

const indexerUrl = process.env.MN_PREVIEW_INDEXER_URL;
const nodeUrl = process.env.MN_PREVIEW_NODE_URL;
const address = process.env.MN_PREVIEW_CONTRACT;

async function http(request: HttpRequest): Promise<HttpResponse> {
  const controller = new AbortController();
  request.signal?.addEventListener('abort', () => controller.abort());
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers ?? {},
    body: request.body ?? null,
    signal: controller.signal,
  });
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body: new Uint8Array(await response.arrayBuffer()),
  };
}

// The merge rule compares bytes, so a different encoding makes the node win on almost every read.
test(
  'the indexer and the node give the same bytes at the same block',
  {
    skip:
      (!indexerUrl || !nodeUrl || !address) &&
      'set MN_PREVIEW_INDEXER_URL, MN_PREVIEW_NODE_URL, and MN_PREVIEW_CONTRACT',
  },
  async () => {
    const timeoutMs = 30_000;
    const indexer = await readContractState(
      { url: indexerUrl ?? '', http, timeoutMs },
      address ?? '',
    );
    assert.ok(indexer.head, 'the indexer has no block');
    assert.ok(indexer.state, `the indexer has no contract at ${String(address)}`);
    // The adapter reads the node only at its best block, so the test pins the block itself.
    const answer = await http({
      url: nodeUrl ?? '',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'midnight_contractState',
        params: [address, `0x${indexer.head.hash}`],
      }),
    });
    const { result } = JSON.parse(new TextDecoder().decode(answer.body)) as { result?: unknown };
    assert.equal(
      typeof result === 'string' ? result.toLowerCase() : result,
      Buffer.from(indexer.state.bytes).toString('hex'),
      `the sources give different bytes at block ${indexer.head.height}`,
    );
  },
);
