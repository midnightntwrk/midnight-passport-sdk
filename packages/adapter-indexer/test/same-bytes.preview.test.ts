import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readContractState } from '../dist/reads.js';
import { http, needs, preview } from './preview.js';

const {
  MN_PREVIEW_INDEXER_URL: indexerUrl,
  MN_PREVIEW_NODE_URL: nodeUrl,
  MN_PREVIEW_CONTRACT: address,
} = preview;

// The merge rule compares bytes, so a different encoding makes the node win on almost every read.
test(
  'the indexer and the node give the same bytes at the same block',
  {
    skip: needs('MN_PREVIEW_INDEXER_URL', 'MN_PREVIEW_NODE_URL', 'MN_PREVIEW_CONTRACT'),
    timeout: 120_000,
  },
  async () => {
    const indexer = await readContractState({ url: indexerUrl, http, timeoutMs: 30_000 }, address);
    assert.ok(indexer.head, 'the indexer has no block');
    assert.ok(indexer.state, `the indexer has no contract at ${address}`);
    // The adapter reads the node only at its best block, so the test pins the block itself.
    const answer = await http({
      url: nodeUrl,
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
