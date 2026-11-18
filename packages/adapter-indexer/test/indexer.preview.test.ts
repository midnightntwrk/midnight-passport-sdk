import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Indexer, StateSource } from '@midnight-ntwrk/mn-passport-core';
import { createIndexer } from '@midnight-ntwrk/mn-passport-adapter-indexer';
import { http, needs, preview } from './preview.js';

const indexer = (): Indexer =>
  createIndexer({
    indexerUrl: preview.MN_PREVIEW_INDEXER_URL,
    ...(preview.MN_PREVIEW_NODE_URL ? { nodeUrl: preview.MN_PREVIEW_NODE_URL } : {}),
    ...(preview.MN_PREVIEW_INDEXER_WS_URL
      ? { indexerWsUrl: preview.MN_PREVIEW_INDEXER_WS_URL }
      : {}),
    http,
    requestTimeoutMs: 30_000,
  });

const open: (() => void)[] = [];
after(() => {
  for (const stop of open.splice(0)) stop();
});

/** The first value, or the first error. */
const first = <A>(source: StateSource<A>): Promise<A> =>
  new Promise((resolve, reject) => void open.push(source.subscribe(resolve, reject)));

test(
  'Preview: a deployed contract has state, and an unknown address reads as undefined',
  { skip: needs('MN_PREVIEW_INDEXER_URL', 'MN_PREVIEW_CONTRACT'), timeout: 120_000 },
  async () => {
    const reads = indexer();
    const state = await reads.contractState(preview.MN_PREVIEW_CONTRACT);
    assert.ok(state, `no contract at ${preview.MN_PREVIEW_CONTRACT}`);
    assert.ok(state.bytes.length > 0);
    assert.equal(await reads.contractState('ff'.repeat(32)), undefined);
  },
);

test(
  'Preview: a known transaction is final with a result, and an unknown one reads as undefined',
  { skip: needs('MN_PREVIEW_INDEXER_URL', 'MN_PREVIEW_TX'), timeout: 120_000 },
  async () => {
    const reads = indexer();
    const status = await reads.transaction(preview.MN_PREVIEW_TX);
    assert.equal(status?.level, 'final');
    assert.ok(status.result !== undefined);
    assert.equal(await reads.transaction('ee'.repeat(32)), undefined);
  },
);

test(
  'Preview: the subscription stays open for three keep-alive periods',
  {
    skip: needs('MN_PREVIEW_INDEXER_URL', 'MN_PREVIEW_INDEXER_WS_URL', 'MN_PREVIEW_CONTRACT'),
    timeout: 120_000,
  },
  async () => {
    const sockets: WebSocket[] = [];
    let closes = 0;
    class Counting extends WebSocket {
      constructor(url: string, protocols: string) {
        super(url, protocols);
        sockets.push(this);
        this.addEventListener('close', () => closes++);
      }
    }
    const keepAliveMs = 2_000;
    const reads = createIndexer({
      indexerUrl: preview.MN_PREVIEW_INDEXER_URL,
      indexerWsUrl: preview.MN_PREVIEW_INDEXER_WS_URL,
      http,
      webSocket: Counting,
      keepAliveMs,
    });
    const found = await first(reads.watchContract(preview.MN_PREVIEW_CONTRACT));
    assert.equal(found.found, true);
    await new Promise((resolve) => setTimeout(resolve, 3 * keepAliveMs + 1_000));
    assert.equal(sockets.length, 1, `${sockets.length} sockets`);
    assert.equal(closes, 0);
  },
);
