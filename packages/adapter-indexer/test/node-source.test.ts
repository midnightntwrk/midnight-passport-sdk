import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ContractState, HttpRequest, HttpResponse } from '@midnight-ntwrk/mn-passport-core';
import { expectRejection } from '@midnight-ntwrk/mn-passport-dev';
import { mergeState } from '../dist/merge.js';
import type { NodeStateRead } from '../dist/node.js';
import { createReads, type IndexerStateRead } from '../dist/reads.js';
import {
  INDEXER_URL,
  NODE_URL,
  block,
  encode,
  nodeWith,
  response,
  route,
  stateAnswer,
  type Sent,
} from './fakes.js';

type Http = (request: HttpRequest) => Promise<HttpResponse>;

const address = 'ab'.repeat(32);
const OLD = Uint8Array.of(1, 2);
const NEW = Uint8Array.of(3, 4);

const indexer = (state: Uint8Array | undefined, head = 10): IndexerStateRead => ({
  head: block(head),
  state: state && { address, bytes: state, block: block(head - 2) },
});
const node = (bytes: Uint8Array, height: number): NodeStateRead => ({
  block: block(height),
  bytes,
});
const fromNode = (bytes: Uint8Array, height: number): ContractState => ({
  address,
  bytes,
  block: block(height),
});

const rows: readonly (readonly [
  string,
  IndexerStateRead,
  NodeStateRead | undefined,
  ContractState | undefined,
])[] = [
  ['not found, node nothing', indexer(undefined), undefined, undefined],
  ['not found, node state not higher', indexer(undefined), node(NEW, 10), undefined],
  ['not found, node state higher', indexer(undefined), node(NEW, 11), fromNode(NEW, 11)],
  ['found, node nothing', indexer(OLD), undefined, indexer(OLD).state],
  ['found, node same bytes and higher', indexer(OLD), node(OLD, 11), indexer(OLD).state],
  ['found, node different bytes not higher', indexer(OLD), node(NEW, 9), indexer(OLD).state],
  ['found, node different bytes and higher', indexer(OLD), node(NEW, 11), fromNode(NEW, 11)],
  [
    'no indexer block yet, node state',
    { head: undefined, state: undefined },
    node(NEW, 0),
    fromNode(NEW, 0),
  ],
];
for (const [name, fromIndexer, fromNodeRead, expected] of rows) {
  test(`merge: ${name}`, () => {
    assert.deepEqual(mergeState(address, fromIndexer, fromNodeRead), expected);
  });
}

const indexerAnswer = (state: string | null) => stateAnswer(state, 8, 10);
// Above the indexer, with bytes that differ from its 0102.
const goodNode = () => nodeWith('0304', 11).http;

const reads = (http: Http, requestTimeoutMs = 1_000) =>
  createReads({ indexerUrl: INDEXER_URL, nodeUrl: NODE_URL, http, requestTimeoutMs });

test('the node read is pinned to one hash, and its newer state wins', async () => {
  const sent: Sent[] = [];
  const state = await reads(route(async () => indexerAnswer(null), goodNode(), sent)).contractState(
    address,
  );
  assert.deepEqual(state, { address, bytes: NEW, block: block(11) });
  const toNode = sent.filter((s) => s.url === NODE_URL);
  assert.deepEqual(toNode.map((s) => s.method).sort(), [
    'chain_getBlockHash',
    'chain_getHeader',
    'midnight_contractState',
  ]);
  const pinned = toNode
    .filter((s) => s.method !== 'chain_getBlockHash')
    .map((s) => s.params.at(-1));
  assert.deepEqual(pinned, [`0x${block(11).hash}`, `0x${block(11).hash}`]);
});

test('without a node URL, no node request is sent', async () => {
  const sent: Sent[] = [];
  const indexer = createReads({
    indexerUrl: INDEXER_URL,
    http: route(async () => indexerAnswer('0102'), goodNode(), sent),
  });
  assert.deepEqual((await indexer.contractState(address))?.bytes, OLD);
  assert.deepEqual(
    sent.map((s) => s.url),
    [INDEXER_URL, INDEXER_URL],
  );
});

// The good node is above the indexer and has different bytes, so only a failure gives the indexer's answer.
const failing = (method: string, result: unknown): Http => {
  const stub = nodeWith('0304', 11);
  stub.on(method, () => ({ result }));
  return stub.http;
};

const nodeFailures: readonly (readonly [string, () => Http])[] = [
  ['a network failure', () => () => Promise.reject(new Error('ECONNREFUSED'))],
  ['a JSON-RPC error', () => nodeWith(undefined, 11).http],
  ['a null header', () => failing('chain_getHeader', null)],
  ['a hash with no 0x', () => failing('chain_getBlockHash', block(11).hash)],
  ['state that is not hex', () => failing('midnight_contractState', 'zz')],
  ['no answer before the timeout', () => () => new Promise<HttpResponse>(() => {})],
];

for (const [name, node] of nodeFailures) {
  test(`a node with ${name} gives the indexer's answer`, async () => {
    const indexer = reads(
      route(async () => indexerAnswer('0102'), node()),
      20,
    );
    assert.deepEqual(await indexer.contractState(address), {
      address,
      bytes: OLD,
      block: block(8),
    });
  });
}

test('one deadline covers the whole node read', async () => {
  const good = goodNode();
  const late: Http = (request) =>
    new Promise((resolve) => setTimeout(() => resolve(good(request)), 30));
  const indexer = reads(
    route(async () => indexerAnswer('0102'), late),
    50,
  );
  assert.deepEqual((await indexer.contractState(address))?.bytes, OLD);
});

// A read that waits for the hung node ends only at its 60 s deadline.
test('an indexer failure rejects at once and aborts the node', { timeout: 2_000 }, async () => {
  const sent: Sent[] = [];
  const hung: Http = () => new Promise<HttpResponse>(() => {});
  const indexer = reads(
    route(() => Promise.reject(new Error('ECONNREFUSED')), hung, sent),
    60_000,
  );
  await expectRejection(() => indexer.contractState(address), 'IndexerUnreachableError');
  const nodeRequest = sent.find((s) => s.url === NODE_URL);
  assert.equal(nodeRequest?.signal?.aborted, true);
});

test('an indexer that is down rejects, also when the node answers', async () => {
  const indexer = reads(route(async () => response(503, encode('{}')), goodNode()));
  await expectRejection(() => indexer.contractState(address), 'IndexerUnreachableError');
});

test('an abort while only the node is open cancels the node read', { timeout: 2_000 }, async () => {
  const sent: Sent[] = [];
  const caller = new AbortController();
  const indexer = reads(
    route(
      async () => indexerAnswer('0102'),
      () => new Promise<HttpResponse>(() => {}),
      sent,
    ),
    60_000,
  );
  const read = indexer.contractState(address, { signal: caller.signal });
  // One macrotask runs every microtask of the indexer read, so only the node is open here.
  await new Promise((resolve) => setImmediate(resolve));
  caller.abort();
  await expectRejection(() => read, 'CancelledError');
  assert.equal(sent.find((s) => s.url === NODE_URL)?.signal?.aborted, true);
});
