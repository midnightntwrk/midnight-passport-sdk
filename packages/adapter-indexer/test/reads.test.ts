import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type {
  AbortSignalLike,
  HttpRequest,
  HttpResponse,
  IndexerUnreachableError,
} from '@midnight-ntwrk/mn-passport-core';
import { abortedSignal, expectRejection } from '@midnight-ntwrk/mn-passport-dev';
import { createReads } from '../dist/reads.js';
import { INDEXER_URL, encode, ok, rejectsUnreachable, response } from './fakes.js';

interface Fixture {
  readonly request: { readonly query: string; readonly variables: unknown };
  readonly response: { readonly status: number; readonly body: unknown };
}

const fixture = (name: string): Fixture =>
  JSON.parse(
    readFileSync(new URL(`../test/fixtures/${name}.json`, import.meta.url), 'utf8'),
  ) as Fixture;

/** Fails the test when the adapter's request is not the recorded one. */
function replay(name: string): (request: HttpRequest) => Promise<HttpResponse> {
  const { request, response: recorded } = fixture(name);
  return async (sent) => {
    assert.equal(sent.method, 'POST');
    assert.equal(sent.url, INDEXER_URL);
    assert.equal(sent.headers?.['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(String(sent.body)), request);
    return response(recorded.status, encode(JSON.stringify(recorded.body)));
  };
}

const address = 'ab'.repeat(32);
const id = 'cd'.repeat(32);
const reads = (http: (request: HttpRequest) => Promise<HttpResponse>, requestTimeoutMs = 1_000) =>
  createReads({ indexerUrl: INDEXER_URL, http, requestTimeoutMs });

test('a found contract has its bytes and the block where the state last changed', async () => {
  const state = await reads(replay('contract-found')).contractState(address);
  assert.deepEqual(state, {
    address,
    bytes: Uint8Array.of(0x00, 0x01, 0x02, 0xa0, 0xff),
    block: { height: 1037, hash: '1e'.repeat(32) },
  });
});

test('an unknown contract and an unknown transaction read as undefined', async () => {
  assert.equal(await reads(replay('contract-not-found')).contractState(address), undefined);
  assert.equal(await reads(replay('transaction-not-found')).transaction(id), undefined);
});

test('a found transaction is final, with its block and result', async () => {
  assert.deepEqual(await reads(replay('transaction-final')).transaction(id), {
    id,
    level: 'final',
    block: { height: 1040, hash: '2d'.repeat(32) },
    result: 'partly-failed',
  });
});

// Valid "not found" data for both reads, so only the check under test can reject it.
const notFound = '{"data":{"block":null,"contract":null,"transactions":[]}}';

type Reason = IndexerUnreachableError['reason'];
const failures: readonly (readonly [string, Reason, () => Promise<HttpResponse>])[] = [
  ['a network failure', 'network', () => Promise.reject(new Error('ECONNREFUSED'))],
  ['a 503', 'status', async () => response(503, encode('{}'))],
  ['a body that is not JSON', 'response', async () => response(200, encode('<html>'))],
  [
    'a body that is not UTF-8',
    'response',
    async () =>
      response(
        200,
        Uint8Array.from([
          ...encode(notFound.slice(0, -1)),
          ...encode(',"x":"'),
          0xff,
          ...encode('"}'),
        ]),
      ),
  ],
  ['a body with no data', 'response', async () => response(200, encode('{}'))],
  [
    'a GraphQL error beside "not found" data',
    'response',
    async () => response(200, encode(`{"errors":[{"message":"x"}],${notFound.slice(1)}`)),
  ],
  [
    'an errors object that is not a list',
    'response',
    async () => response(200, encode(`{"errors":{"message":"x"},${notFound.slice(1)}`)),
  ],
  ['a missing field', 'response', async () => response(200, encode('{"data":{"block":null}}'))],
  [
    'a body over 16 MiB',
    'response',
    async () => response(200, encode(notFound.padEnd(16 * 1024 * 1024 + 1))),
  ],
  ['no answer before the timeout', 'timeout', () => new Promise<HttpResponse>(() => {})],
  [
    'an http function that throws',
    'network',
    () => {
      throw new Error('bad URL');
    },
  ],
];

for (const [name, reason, http] of failures) {
  test(`${name} is IndexerUnreachableError (${reason}), never "not found"`, async () => {
    const signals: (AbortSignalLike | undefined)[] = [];
    const indexer = reads((request) => {
      signals.push(request.signal);
      return http();
    }, 20);
    await rejectsUnreachable(() => indexer.contractState(address), reason);
    await rejectsUnreachable(() => indexer.transaction(id), reason);
    // A request that timed out must not stay open.
    if (reason === 'timeout') assert.ok(signals.every((s) => s?.aborted));
  });
}

for (const state of ['xyz', 'abc', '']) {
  test(`the state "${state}" is IndexerUnreachableError`, async () => {
    const contract = { state, stateAt: { height: 1, hash: 'aa'.repeat(32) } };
    const body = { data: { block: null, contract } };
    const indexer = reads(async () => ok(body));
    await rejectsUnreachable(() => indexer.contractState(address), 'response');
  });
}

for (const status of ['MAYBE', 'constructor', '__proto__']) {
  test(`the result status "${status}" is IndexerUnreachableError`, async () => {
    const tx = { __typename: 'RegularTransaction', block: { height: 1, hash: 'aa'.repeat(32) } };
    const body = { data: { transactions: [{ ...tx, transactionResult: { status } }] } };
    const indexer = reads(async () => ok(body));
    await rejectsUnreachable(() => indexer.transaction(id), 'response');
  });
}

test('a list with only system transactions reads as not found', async () => {
  const system = { __typename: 'SystemTransaction', block: { height: 1, hash: 'aa'.repeat(32) } };
  const indexer = reads(async () => ok({ data: { transactions: [system] } }));
  assert.equal(await indexer.transaction(id), undefined);
});

for (const entry of ['{}', '{"__typename":7}', 'null']) {
  test(`a transaction entry ${entry} is IndexerUnreachableError, never "not found"`, async () => {
    const indexer = reads(async () =>
      response(200, encode(`{"data":{"transactions":[${entry}]}}`)),
    );
    await rejectsUnreachable(() => indexer.transaction(id), 'response');
  });
}

test('a block hash that is not 32 bytes is IndexerUnreachableError', async () => {
  const body = { data: { block: { height: 1, hash: 'aa' }, contract: null } };
  const indexer = reads(async () => ok(body));
  await rejectsUnreachable(() => indexer.contractState(address), 'response');
});

test('an abort before the read sends nothing and rejects with CancelledError', async () => {
  let sent = 0;
  const indexer = reads(async () => {
    sent++;
    return response(200, encode('{}'));
  });
  const aborted = abortedSignal();
  await expectRejection(
    () => indexer.contractState(address, { signal: aborted }),
    'CancelledError',
  );
  await expectRejection(() => indexer.transaction(id, { signal: aborted }), 'CancelledError');
  assert.equal(sent, 0);
});

test('an abort during a read cancels the request and wins over its failure', async () => {
  let requestSignal: AbortSignalLike | undefined;
  let fail: (error: Error) => void = () => {};
  const indexer = reads((request) => {
    requestSignal = request.signal;
    return new Promise<HttpResponse>((_resolve, reject) => (fail = reject));
  });
  const caller = new AbortController();
  const running = indexer.contractState(address, { signal: caller.signal });
  caller.abort();
  fail(new Error('aborted'));
  await expectRejection(() => running, 'CancelledError');
  assert.equal(requestSignal?.aborted, true);
});
