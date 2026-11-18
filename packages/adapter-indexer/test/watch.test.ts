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
import {
  createIndexer,
  type WebSocketConstructorLike,
  type WebSocketLike,
} from '@midnight-ntwrk/mn-passport-adapter-indexer';
import { INDEXER_URL, NODE_URL, block, nodeWith, ok, route, stateAnswer } from './fakes.js';

const WS_URL = 'wss://indexer.test/graphql/ws';
const id = 'cd'.repeat(32);

const down: HttpResponse = { status: 503, headers: {}, body: new Uint8Array() };
const none = ok({ data: { transactions: [] } });
const address = 'ab'.repeat(32);
const bytesOf = (lookup: Lookup<{ readonly bytes: Uint8Array }> | undefined) =>
  lookup?.found ? [...lookup.value.bytes] : undefined;

let clock: TestContext['mock']['timers'] | undefined;
/** Each test runs on fake time, so a busy machine cannot change what it sees. */
const fakeTime = (t: TestContext): void => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
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

class FakeSocket implements WebSocketLike {
  static all: FakeSocket[] = [];
  readonly sent: Record<string, unknown>[] = [];
  closed = false;
  private readonly listeners = new Map<string, ((event: { readonly data: unknown }) => void)[]>();

  constructor(
    readonly url: string,
    readonly protocol: string,
  ) {
    FakeSocket.all.push(this);
    queueMicrotask(() => this.emit('open'));
  }
  addEventListener(type: string, listener: (event: { readonly data: unknown }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    queueMicrotask(() => this.emit('close'));
  }
  emit(type: string, data?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
  server(message: object): void {
    this.emit('message', JSON.stringify(message));
  }
}

const socketWatch = (http: Http, extra: Partial<Parameters<typeof createIndexer>[0]> = {}) => {
  FakeSocket.all = [];
  const webSocket = FakeSocket satisfies WebSocketConstructorLike;
  return record(
    indexer(http, { indexerWsUrl: WS_URL, webSocket, ...extra }).watchContract(address),
  );
};
const opened = (n: number) => until(() => FakeSocket.all[n]?.sent.length === 1);
const acked = async (n: number): Promise<FakeSocket> => {
  await opened(n);
  const socket = FakeSocket.all[n];
  assert.ok(socket);
  socket.server({ type: 'connection_ack' });
  return socket;
};
const event = { id: '1', type: 'next', payload: { data: { contractActions: { address } } } };

test('each subscription event reads the state, and a closed socket reconnects', async (t) => {
  fakeTime(t);
  let state = '01';
  const fake = counting(() => stateAnswer(state));
  const watch = socketWatch(fake.http, { pollMs: 60_000, maxBackoffMs: 10 });
  await until(() => watch.values.length === 1);
  await opened(0);
  const socket = FakeSocket.all[0];
  assert.ok(socket);
  assert.equal(socket.url, WS_URL);
  assert.equal(socket.protocol, 'graphql-transport-ws');
  assert.deepEqual(socket.sent[0], { type: 'connection_init' });

  socket.server({ type: 'connection_ack' });
  const subscribe = socket.sent[1] as {
    type: string;
    payload: { query: string; variables: unknown };
  };
  assert.equal(subscribe.type, 'subscribe');
  assert.match(subscribe.payload.query, /contractActions\(address: \$address\)/);
  assert.deepEqual(subscribe.payload.variables, { address });
  socket.server({ type: 'ping' });
  assert.deepEqual(socket.sent[2], { type: 'pong' });

  state = '02';
  socket.server(event);
  await until(() => watch.values.length === 2);
  assert.deepEqual(bytesOf(watch.values[1]), [2]);

  socket.close();
  const again = await acked(1);
  const readsBefore = fake.calls;
  again.server(event);
  await until(() => fake.calls > readsBefore);
  await wait(5);
  assert.equal(watch.values.length, 2, 'a replayed event emitted a value');

  watch.stop();
  assert.equal(again.closed, true);
  await wait(30);
  assert.equal(FakeSocket.all.length, 2);
});

const endings: readonly (readonly [string, string])[] = [
  ['a bad frame', '{not json'],
  ['a frame over 16 MiB', JSON.stringify({ ...event, pad: ' '.repeat(16 * 1024 * 1024) })],
  ['a next with errors', JSON.stringify({ ...event, payload: { errors: [{ message: 'x' }] } })],
  ['a second acknowledgement', JSON.stringify({ type: 'connection_ack' })],
];

for (const [name, frame] of endings) {
  test(`${name} ends the socket, starts no read, and the watch goes on`, async (t) => {
    fakeTime(t);
    const fake = counting(() => stateAnswer('01'));
    const watch = socketWatch(fake.http, { pollMs: 60_000, maxBackoffMs: 10 });
    const socket = await acked(0);
    const reads = fake.calls;
    socket.emit('message', frame);
    await until(() => FakeSocket.all.length === 2);
    assert.equal(socket.closed, true);
    assert.equal(fake.calls, reads);
    assert.equal(socket.sent.filter((m) => m.type === 'subscribe').length, 1);
    assert.equal(watch.errors.length, 0);
  });
}

test('an event during a read starts one more read after it', async (t) => {
  fakeTime(t);
  let state = '01';
  let release: () => void = () => {};
  let slow = false;
  const watch = socketWatch(
    async () => {
      const answer = stateAnswer(state);
      if (slow) await new Promise<void>((resolve) => (release = resolve));
      return answer;
    },
    // The slow polling must not do the second read.
    { pollMs: 60_000, maxBackoffMs: 60_000 },
  );
  await until(() => watch.values.length === 1);
  const socket = await acked(0);
  slow = true;
  socket.server(event);
  await wait(5);
  state = '02';
  slow = false;
  socket.server(event);
  release();
  await until(() => watch.values.length === 2);
  assert.deepEqual(bytesOf(watch.values[1]), [2]);
});

const stopsDuring: readonly (readonly [string, (socket: FakeSocket) => void])[] = [
  ['a reconnect wait', (socket) => socket.close()],
  ['the wait for the acknowledgement', () => {}],
  ['a live subscription', (socket) => socket.server({ type: 'connection_ack' })],
];

for (const [name, setUp] of stopsDuring) {
  test(`a stop during ${name} leaves no timer and opens no socket`, async () => {
    const before = timers();
    const watch = socketWatch(async () => stateAnswer('01'), { pollMs: 60_000, maxBackoffMs: 20 });
    await opened(0);
    const socket = FakeSocket.all[0];
    assert.ok(socket);
    setUp(socket);
    await flush();
    // A socket timer is live beside the poll timer, so the check after the stop can fail.
    assert.ok(timers() > before + 1);
    watch.stop();
    assert.equal(timers(), before);
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(FakeSocket.all.length, 1);
  });
}

for (const node of [false, true]) {
  const name = node
    ? 'with a node, a live subscription keeps the normal polling'
    : 'a live subscription slows the polling, and polling is fast again when the socket ends';
  test(name, async (t) => {
    fakeTime(t);
    const fake = counting(() => stateAnswer('01'));
    // The node has no contract, so only the indexer reads count.
    const http = route(fake.http, nodeWith(undefined, 1).http);
    socketWatch(http, { pollMs: 5, maxBackoffMs: 1_000, ...(node ? { nodeUrl: NODE_URL } : {}) });
    const socket = await acked(0);
    await wait(15);
    const live = fake.calls;
    await wait(60);
    const reads = fake.calls - live;
    assert.ok(node ? reads >= 4 : reads <= 1, `${reads} reads in 60 ms while live`);
    if (node) return;
    socket.close();
    const ended = fake.calls;
    await wait(60);
    assert.ok(
      fake.calls - ended >= 4,
      `${fake.calls - ended} reads in 60 ms after the socket ended`,
    );
  });
}

test('an event during an outage does not end the backoff', async (t) => {
  fakeTime(t);
  const fake = counting(() => down);
  socketWatch(fake.http, { pollMs: 10, maxBackoffMs: 1_000 });
  const socket = await acked(0);
  await until(() => fake.calls >= 1);
  for (let i = 0; i < 20; i++) {
    socket.server(event);
    await wait(2);
  }
  // Backoff gives reads at 0, 20, and 60 ms. One read for each event gives about 20.
  assert.ok(fake.calls <= 4, `${fake.calls} reads`);
});

test('an event during a read that fails does not end the backoff', async (t) => {
  fakeTime(t);
  const pending: ((response: HttpResponse) => void)[] = [];
  socketWatch(() => new Promise<HttpResponse>((resolve) => pending.push(resolve)), {
    pollMs: 50,
    maxBackoffMs: 1_000,
  });
  const socket = await acked(0);
  assert.equal(pending.length, 1);
  socket.server(event);
  pending[0]?.(down);
  await wait(30);
  assert.equal(pending.length, 1, 'a read went out before the backoff ended');
});

test('a socket with no acknowledgement ends after maxBackoffMs', async (t) => {
  fakeTime(t);
  const start = Date.now();
  socketWatch(async () => stateAnswer('01'), { pollMs: 60_000, maxBackoffMs: 20 });
  await until(() => FakeSocket.all[0]?.closed === true);
  assert.equal(Date.now() - start, 20);
});

const pingsOf = (socket: FakeSocket) => socket.sent.filter((m) => m.type === 'ping').length;

test('a silent socket gets a ping, and ends 1.5 times keepAliveMs after its last message', async (t) => {
  fakeTime(t);
  socketWatch(async () => stateAnswer('01'), { pollMs: 5, maxBackoffMs: 1_000, keepAliveMs: 20 });
  const socket = await acked(0);
  const ackAt = Date.now();
  await wait(5);
  assert.equal(pingsOf(socket), 0, 'a ping went out before the quiet time');
  await until(() => pingsOf(socket) > 0);
  await until(() => socket.closed);
  assert.equal(Date.now() - ackAt, 30);
  await until(() => FakeSocket.all.length === 2);
  const pingsAtClose = pingsOf(socket);
  socket.server({ type: 'pong' });
  await wait(50);
  assert.equal(pingsOf(socket), pingsAtClose, 'a closed socket sent a ping');
});

const keepAlive: readonly (readonly [
  string,
  (socket: FakeSocket) => () => void,
  number,
  readonly [number, number],
])[] = [
  [
    'a socket that answers each ping',
    (socket) => {
      let answered = 0;
      return () => {
        if (pingsOf(socket) === answered) return;
        answered = pingsOf(socket);
        socket.server({ type: 'pong' });
      };
    },
    2,
    // About one ping for each 10 ms of quiet.
    [3, 12],
  ],
  ['a socket with any message and no pong', (socket) => () => socket.server(event), 4, [0, 0]],
];

for (const [name, server, everyMs, [least, most]] of keepAlive) {
  test(`${name} stays live`, async (t) => {
    fakeTime(t);
    socketWatch(async () => stateAnswer('01'), {
      pollMs: 60_000,
      maxBackoffMs: 1_000,
      keepAliveMs: 10,
    });
    const socket = await acked(0);
    const timer = setInterval(server(socket), everyMs);
    // Six times the idle limit of 15 ms.
    await wait(90);
    clearInterval(timer);
    assert.equal(socket.closed, false);
    assert.equal(FakeSocket.all.length, 1);
    assert.ok(pingsOf(socket) >= least && pingsOf(socket) <= most, `${pingsOf(socket)} pings`);
  });
}

test('the backoff grows while each socket ends soon after its ack, and resets after a stable one', async (t) => {
  fakeTime(t);
  socketWatch(async () => stateAnswer('01'), { pollMs: 5, maxBackoffMs: 40 });
  const at: number[] = [];
  for (let n = 0; n < 5; n++) {
    const socket = await acked(n);
    at.push(Date.now());
    if (n < 4) {
      // A server can ack, send one event, and end.
      socket.server(event);
      socket.server({ id: '1', type: 'error', payload: [] });
    } else {
      await wait(41);
      socket.close();
    }
  }
  await opened(5);
  at.push(Date.now());
  assert.deepEqual(gaps(at), [10, 20, 40, 40, 51]);
});
