import { afterEach, test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type {
  AbortSignalLike,
  HttpRequest,
  HttpResponse,
  Lookup,
  PassportError,
  StateSource,
} from '@midnight-ntwrk/mn-passport-core';
import { createIndexer } from '@midnight-ntwrk/mn-passport-adapter-indexer';
import { INDEXER_URL, NODE_URL, block, nodeWith, ok, route, stateAnswer } from './fakes.js';

const id = 'cd'.repeat(32);

const down: HttpResponse = { status: 503, headers: {}, body: new Uint8Array() };
const none = ok({ data: { transactions: [] } });
const address = 'ab'.repeat(32);
const bytesOf = (lookup: Lookup<{ readonly bytes: Uint8Array }> | undefined) =>
  lookup?.found ? [...lookup.value.bytes] : undefined;

let clock: TestContext['mock']['timers'] | undefined;
/** Each test runs on fake time, so a busy machine cannot change what it sees. */
const fakeTime = (t: TestContext): void => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  clock = t.mock.timers;
};
// A macrotask runs every pending microtask, so each read finishes before the next tick.
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const wait = async (ms: number): Promise<void> => {
  for (let i = 0; i < ms; i++) {
    await flush();
    clock?.tick(1);
  }
  await flush();
};
const until = async (done: () => boolean, ms = 1_000): Promise<void> => {
  for (let i = 0; !done(); i++) {
    if (i > ms) throw new Error('timed out');
    await wait(1);
  }
};

const open: (() => void)[] = [];
// A failed test stops its watches too, so it fails instead of keeping the process alive.
afterEach(() => {
  for (const stop of open.splice(0)) stop();
  clock = undefined;
});

/** Records each value and error until `stop`. */
function record<A>(source: StateSource<A>) {
  const values: A[] = [];
  const errors: PassportError[] = [];
  const stop = source.subscribe(
    (value) => values.push(value),
    (error) => errors.push(error),
  );
  open.push(stop);
  return { values, errors, stop };
}

const indexer = (
  http: (request: HttpRequest) => Promise<HttpResponse>,
  extra: Partial<Parameters<typeof createIndexer>[0]> = {},
) => createIndexer({ indexerUrl: INDEXER_URL, http, pollMs: 5, maxBackoffMs: 20, ...extra });

const gaps = (at: readonly number[]) => at.slice(1).map((time, i) => time - (at[i] ?? 0));

/** Gives `answer(n)` to the n-th request, from 0. */
function counting(answer: (n: number) => HttpResponse) {
  const fake = { calls: 0, http: async (): Promise<HttpResponse> => answer(fake.calls++) };
  return fake;
}

type Http = (request: HttpRequest) => Promise<HttpResponse>;
const outages: readonly (readonly [string, (http: Http) => StateSource<unknown>, HttpResponse])[] =
  [
    ['transaction', (http) => indexer(http).watchTransaction(id), none],
    ['contract', (http) => indexer(http).watchContract(address), stateAnswer('01')],
  ];

for (const [name, watchOf, answer] of outages) {
  test(`after an outage the same ${name} value emits again, and each outage is reported`, async (t) => {
    fakeTime(t);
    // Up, down, up, down, up: each phase is two reads.
    const fake = counting((n) => ([2, 3, 6, 7].includes(n) ? down : answer));
    const watch = record(watchOf(fake.http));
    await until(() => fake.calls > 9);
    watch.stop();
    const tag = 'IndexerUnreachableError';
    assert.deepEqual(
      watch.errors.map((e) => e._tag),
      [tag, tag],
    );
    assert.equal(watch.values.length, 3);
    for (const value of watch.values) assert.deepEqual(value, watch.values[0]);
  });
}

test('an outage doubles the delay from pollMs up to maxBackoffMs', async (t) => {
  fakeTime(t);
  const at: number[] = [];
  const watch = record(
    indexer(async () => {
      at.push(Date.now());
      return down;
    }).watchTransaction(id),
  );
  await wait(100);
  watch.stop();
  assert.deepEqual(gaps(at).slice(0, 4), [10, 20, 20, 20]);
});

test('a stop during a read aborts the request, and nothing emits after it', async (t) => {
  fakeTime(t);
  let signal: AbortSignalLike | undefined;
  let answer: (response: HttpResponse) => void = () => {};
  const watch = record(
    indexer(
      (request) =>
        new Promise<HttpResponse>((resolve) => {
          signal = request.signal;
          answer = resolve;
        }),
    ).watchTransaction(id),
  );
  await until(() => signal !== undefined);
  watch.stop();
  assert.equal(signal?.aborted, true);
  answer(none);
  await wait(10);
  assert.deepEqual(watch.values, []);
});

// On real time, because a timer that is left after a stop keeps the process alive.
const timers = () => process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;

const stops = [
  ['a stop', none, false],
  ['an unsubscribe inside the listener', none, true],
  ['an unsubscribe inside onError', down, true],
] as const;

for (const [name, answer, inside] of stops) {
  test(`${name} leaves no timer`, async () => {
    const before = timers();
    let heard = false;
    const hear = (): void => {
      heard = true;
      if (inside) stop();
    };
    const stop: () => void = indexer(async () => answer, { pollMs: 60_000 })
      .watchTransaction(id)
      .subscribe(hear, hear);
    open.push(stop);
    await until(() => heard);
    if (!inside) {
      // The poll timer: the check sees live timers.
      assert.equal(timers(), before + 1);
      stop();
    }
    assert.equal(timers(), before);
  });
}

test('a transaction watch stops polling at final, and a new subscriber gets final again', async (t) => {
  fakeTime(t);
  const final = ok({
    data: {
      transactions: [
        {
          __typename: 'RegularTransaction',
          block: block(3),
          transactionResult: { status: 'SUCCESS' },
        },
      ],
    },
  });
  const fake = counting((n) => (n < 2 ? none : final));
  const source = indexer(fake.http).watchTransaction(id);
  const first = record(source);
  await until(() => first.values.some((v) => v.found));
  const afterFinal = fake.calls;
  await wait(30);
  assert.equal(fake.calls, afterFinal);
  assert.deepEqual(
    first.values.map((v) => (v.found ? v.value.level : 'none')),
    ['none', 'final'],
  );
  first.stop();
  const second = record(source);
  await until(() => second.values.length > 0);
  second.stop();
  assert.equal(second.values[0]?.found && second.values[0].value.level, 'final');
});

test('a watch emits only when "found" or the bytes change, and stops polling after the unsubscribe', async (t) => {
  fakeTime(t);
  const answers = [
    stateAnswer(null),
    stateAnswer('01', 5),
    stateAnswer('01', 6),
    stateAnswer('02'),
  ];
  const fake = counting((n) => answers[Math.min(n, answers.length - 1)] ?? down);
  const watch = record(indexer(fake.http).watchContract(address));
  await until(() => fake.calls > answers.length);
  watch.stop();
  const stoppedAt = fake.calls;
  assert.deepEqual(
    watch.values.map((v) => (v.found ? [...v.value.bytes] : 'none')),
    ['none', [1], [2]],
  );
  await wait(30);
  assert.equal(fake.calls, stoppedAt);
});

/** For each indexer read, its answer, and the node's state and block or `fail` for a network error. */
function chain(
  steps: readonly {
    readonly indexer: HttpResponse;
    readonly node: 'fail' | readonly [string, number];
  }[],
): Http {
  let read = -1;
  const step = () => steps[Math.min(read, steps.length - 1)];
  const node = nodeWith(undefined, 0);
  node.on('midnight_contractState', () => {
    const now = step()?.node;
    return { result: typeof now === 'object' ? now[0] : undefined };
  });
  return route(
    async () => {
      read++;
      return step()?.indexer ?? down;
    },
    async (request) => {
      const now = step()?.node ?? 'fail';
      if (now === 'fail') throw new Error('ECONNREFUSED');
      while (node.best().height < now[1]) node.addBlock();
      return node.http(request);
    },
  );
}

test('a node failure never makes a contract from the node read as missing', async (t) => {
  fakeTime(t);
  const http = chain([
    { indexer: stateAnswer(null, 5, 10), node: ['aa', 12] },
    { indexer: stateAnswer(null, 5, 10), node: 'fail' },
    { indexer: stateAnswer(null, 5, 11), node: 'fail' },
    { indexer: stateAnswer('aa', 12, 12), node: 'fail' },
  ]);
  const watch = record(indexer(http, { nodeUrl: NODE_URL }).watchContract(address));
  await wait(40);
  watch.stop();
  assert.deepEqual(
    watch.values.map((v) => (v.found ? [...v.value.bytes] : 'none')),
    [[0xaa]],
  );
});

test('the bytes do not go back before the indexer reaches the node block', async (t) => {
  fakeTime(t);
  const http = chain([
    { indexer: stateAnswer('0a', 5, 10), node: ['0b', 12] },
    { indexer: stateAnswer('0a', 5, 10), node: 'fail' },
    { indexer: stateAnswer('0a', 5, 11), node: ['0b', 13] },
    { indexer: stateAnswer('0a', 5, 13), node: 'fail' },
  ]);
  const watch = record(indexer(http, { nodeUrl: NODE_URL }).watchContract(address));
  await wait(40);
  watch.stop();
  // The indexer at block 13 still has 0a, so the node's 0b was reverted.
  assert.deepEqual(
    watch.values.map((v) => bytesOf(v)),
    [[0x0b], [0x0a]],
  );
});

test('after a reorg, a node answer past the held block replaces the held bytes', async (t) => {
  fakeTime(t);
  const http = chain([
    { indexer: stateAnswer('aa', 5, 10), node: ['bb', 12] },
    { indexer: stateAnswer('aa', 5, 10), node: ['aa', 13] },
  ]);
  const watch = record(indexer(http, { nodeUrl: NODE_URL }).watchContract(address));
  await wait(20);
  watch.stop();
  assert.deepEqual(
    watch.values.map((v) => bytesOf(v)),
    [[0xbb], [0xaa]],
  );
});
