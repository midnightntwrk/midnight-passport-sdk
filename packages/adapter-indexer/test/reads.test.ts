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

/** Fails the test when the adapter's requests are not the recorded ones, in order. */
function replay(...names: string[]): (request: HttpRequest) => Promise<HttpResponse> {
  const fixtures = names.map(fixture);
  return async (sent) => {
    const next = fixtures.shift();
    assert.ok(next, 'one request too many');
    assert.equal(sent.method, 'POST');
    assert.equal(sent.url, INDEXER_URL);
    assert.equal(sent.headers?.['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(String(sent.body)), next.request);
    return response(next.response.status, encode(JSON.stringify(next.response.body)));
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

const hex = (value: string): Uint8Array => Uint8Array.from(Buffer.from(value, 'hex'));
const local = '19d0e7afd018aebcf526678dda828d3b59ae482f9043bf58180b4c98580a4c6a';
const recordedHead = {
  height: 2935,
  hash: 'dc12b44a0c030c441d68dcc0beeb1960721733ad2b8892474a991f74f51c2444',
};
const recordedParameters =
  '6d69646e696768743a6c65646765722d706172616d65746572735b76385d3ac64a0600008e0a8c0072618b007eed6000';

test('the ledger parameters have their bytes and the head block', async () => {
  assert.deepEqual(await reads(replay('ledger-parameters')).ledgerParameters(), {
    bytes: hex(recordedParameters),
    block: recordedHead,
  });
});

test('the call inputs are pinned to the head block', async () => {
  const inputs = await reads(replay('head', 'call-inputs-found')).callInputs(local);
  assert.deepEqual(inputs, {
    state: {
      address: local,
      bytes: hex(
        '6d69646e696768743a636f6e74726163742d73746174655b76385d3aa90300040404000801040404900304408035a4e6',
      ),
      block: {
        height: 1545,
        hash: '23de74a1f6782ce21961540c2c9b73bb4a236a9a3542074e6bf32298022be764',
      },
    },
    ledgerParameters: hex(recordedParameters),
    zswapChainState: hex(
      '6d69646e696768743a7a737761702d6c65646765722d73746174655b76355d3a7101008473b35bda8df702a240f2b760',
    ),
    block: recordedHead,
  });
});

test('call inputs at an address with no contract read as undefined', async () => {
  const missing = 'ff'.repeat(32);
  const http = replay('head', 'call-inputs-not-found');
  assert.equal(await reads(http).callInputs(missing), undefined);
});

/** The head answer, then `pinned` as the answer of the pinned query. */
const pinnedAnswer = (pinned: unknown) => {
  const answers = [fixture('head').response.body, pinned];
  return async () => ok(answers.shift());
};
const found = fixture('call-inputs-found').response.body as {
  data: { block: Record<string, unknown>; contract: Record<string, unknown> };
};
const withBlock = (fields: Record<string, unknown>) => ({
  data: { ...found.data, block: { ...found.data.block, ...fields } },
});

const brokenInputs: readonly (readonly [string, unknown])[] = [
  ['a contract with no Zswap state', withBlock({ contractZswapState: null })],
  ['a Zswap state with no contract', { data: { ...found.data, contract: null } }],
  ['a pinned block with another hash', withBlock({ hash: 'ee'.repeat(32) })],
  ['parameters that are not hex', withBlock({ ledgerParameters: 'xyz' })],
];
for (const [name, pinned] of brokenInputs) {
  test(`call inputs with ${name} are IndexerUnreachableError`, async () => {
    await rejectsUnreachable(() => reads(pinnedAnswer(pinned)).callInputs(local), 'response');
  });
}

test('an indexer with no block yet is IndexerUnreachableError for parameters and call inputs', async () => {
  const empty = reads(async () => ok({ data: { block: null } }));
  await rejectsUnreachable(() => empty.ledgerParameters(), 'response');
  await rejectsUnreachable(() => empty.callInputs(local), 'response');
});

const deposit = {
  height: 2969,
  hash: 'f713af4cb7c4e2ea01e6d5d134ed68133eb9070bffe510a7db810b424d5dabe0',
};
const depositBody = fixture('zswap-events-deposit').response.body as {
  data: { block: { transactions: { zswapLedgerEvents: { raw: string }[] }[] } };
};
const depositEvents = depositBody.data.block.transactions.flatMap((tx) =>
  tx.zswapLedgerEvents.map((event) => hex(event.raw)),
);

test('the Zswap events of a block are its raw ledger events', async () => {
  const events = await reads(replay('zswap-events-deposit')).zswapEvents(deposit);
  assert.equal(events?.length, 3);
  assert.deepEqual(events, depositEvents);
});

test('the Zswap events of a block come from all of its transactions', async () => {
  const [tx] = depositBody.data.block.transactions;
  const body = {
    data: {
      block: { ...depositBody.data.block, transactions: [{ zswapLedgerEvents: [] }, tx, tx] },
    },
  };
  const events = await reads(async () => ok(body)).zswapEvents(deposit);
  assert.deepEqual(events, [...depositEvents, ...depositEvents]);
});

test('the Zswap events of an unknown block read as undefined', async () => {
  const unknown = { height: 1, hash: 'ee'.repeat(32) };
  assert.equal(await reads(replay('zswap-events-not-found')).zswapEvents(unknown), undefined);
});

const brokenEvents: readonly (readonly [string, Record<string, unknown>])[] = [
  ['another block', { hash: 'ee'.repeat(32) }],
  ['a transaction with no event list', { transactions: [{}] }],
  ['an event that is not hex', { transactions: [{ zswapLedgerEvents: [{ raw: 'xyz' }] }] }],
];
for (const [name, fields] of brokenEvents) {
  test(`Zswap events with ${name} are IndexerUnreachableError`, async () => {
    const body = { data: { block: { ...depositBody.data.block, ...fields } } };
    await rejectsUnreachable(() => reads(async () => ok(body)).zswapEvents(deposit), 'response');
  });
}

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
  await expectRejection(() => indexer.callInputs(address, { signal: aborted }), 'CancelledError');
  await expectRejection(() => indexer.ledgerParameters({ signal: aborted }), 'CancelledError');
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
