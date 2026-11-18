import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { inspect } from 'node:util';
import {
  CancelledError,
  NetworkError,
  PassportError,
  type HttpRequest,
  type HttpResponse,
} from '@midnight-ntwrk/mn-passport-core';
import {
  createTransport,
  openCall,
  serviceUrl,
  untilEnded,
  type Clock,
} from '../dist/transport.js';

// Virtual time: when the process is idle, the earliest timer fires and the clock jumps to it.
function virtualClock(
  onTimer?: (ms: number) => void,
): Clock & { readonly waits: number[]; pending(): number } {
  let now = 0;
  let next = 0;
  const timers = new Map<number, { due: number; run: () => void }>();
  const waits: number[] = [];
  const pump = (): void => {
    setImmediate(() => {
      const [id, timer] = [...timers].sort(([, a], [, b]) => a.due - b.due)[0] ?? [];
      if (id === undefined || timer === undefined) return;
      timers.delete(id);
      now = timer.due;
      timer.run();
      pump();
    });
  };
  return {
    waits,
    pending: () => timers.size,
    now: () => now,
    setTimeout(run, ms) {
      waits.push(ms);
      const id = next++;
      timers.set(id, { due: now + ms, run });
      onTimer?.(ms);
      pump();
      return id;
    },
    clearTimeout: (id) => void timers.delete(id as number),
  };
}

const respond = (status: number, headers: Record<string, string> = {}): HttpResponse => ({
  status,
  headers,
  body: Uint8Array.of(status & 0xff),
});

function harness(
  answer: (request: HttpRequest, index: number) => Promise<HttpResponse>,
  credential?: () => Promise<string>,
  onTimer?: (ms: number) => void,
) {
  const clock = virtualClock(onTimer);
  const requests: HttpRequest[] = [];
  const post = createTransport({
    url: 'https://prover.example',
    platform: { http: (request) => answer(request, requests.push(request) - 1) },
    clock,
    ...(credential ? { credential } : {}),
  });
  const run = (timeoutMs = 300_000, signal?: AbortSignal) => {
    const call = openCall(signal, timeoutMs, clock);
    return post(
      'prove',
      { key: 'midnight/zswap/spend', binding: '42' },
      Uint8Array.of(1),
      call,
    ).finally(() => call.close());
  };
  return { clock, requests, run };
}

const sleeps = (clock: { waits: number[] }) => clock.waits.slice(1);

test('a request posts the raw body with the key and binding in the query', async () => {
  const { requests, run } = harness(async () => respond(200));
  assert.deepEqual(await run(), Uint8Array.of(200));
  const [request] = requests;
  assert.equal(
    request?.url,
    'https://prover.example/prove?key=midnight%2Fzswap%2Fspend&binding=42',
  );
  assert.equal(request?.method, 'POST');
  assert.deepEqual(request?.body, Uint8Array.of(1));
  assert.deepEqual(request?.headers, { 'content-type': 'application/octet-stream' });
});

test('each request gets a fresh bearer credential', async () => {
  let issued = 0;
  const { requests, run } = harness(
    async (_request, index) => respond(index === 0 ? 503 : 200, { 'retry-after': '0' }),
    async () => `token-${issued++}`,
  );
  await run();
  assert.deepEqual(
    requests.map((request) => request.headers?.authorization),
    ['Bearer token-0', 'Bearer token-1'],
  );
});

test('a final status rejects at once with its typed error', async () => {
  const cases = [
    [400, 'ProverRejectedError', 'PROVER_REJECTED', 'input'],
    [422, 'ProverRejectedError', 'PROVER_REJECTED', 'input'],
    [404, 'ProverRejectedError', 'PROVER_REJECTED', 'unknown-key'],
    [413, 'ProverRejectedError', 'PROVER_REJECTED', 'too-large'],
    [401, 'ProverUnauthorizedError', 'PROVER_UNAUTHORIZED', undefined],
    [403, 'ProverUnauthorizedError', 'PROVER_UNAUTHORIZED', undefined],
    [201, 'ProverUnavailableError', 'PROVER_UNAVAILABLE', undefined],
    [418, 'ProverUnavailableError', 'PROVER_UNAVAILABLE', undefined],
  ] as const;
  for (const [status, tag, code, reason] of cases) {
    const { requests, run } = harness(async () => respond(status));
    await assert.rejects(run(), (error: unknown) => {
      assert.ok(error instanceof PassportError);
      assert.equal(error._tag, tag);
      assert.equal(error.name, tag);
      assert.equal(error.code, code);
      assert.equal(Reflect.get(error, 'status'), status);
      if (reason) assert.equal(Reflect.get(error, 'reason'), reason);
      return true;
    });
    assert.equal(requests.length, 1, `status ${status}`);
  }
});

test('busy and down answers retry with 1, 2, 4, 8, and 16 s, then 30 s', async () => {
  const statuses = [429, 500, 502, 503, 504, 503, 503, 200];
  const { clock, requests, run } = harness(async (_r, index) => respond(statuses[index] ?? 200));
  assert.deepEqual(await run(), Uint8Array.of(200));
  assert.equal(requests.length, 8);
  assert.deepEqual(sleeps(clock), [1000, 2000, 4000, 8000, 16_000, 30_000, 30_000]);
});

test('Retry-After in seconds sets the wait, at least 1 s', async () => {
  const answers = [respond(429, { 'Retry-After': '7' }), respond(503, { 'retry-after': '0' })];
  const { clock, run } = harness(async (_r, index) => answers[index] ?? respond(200));
  await run();
  assert.deepEqual(sleeps(clock), [7000, 1000]);
});

test('a busy prover rejects with the retry time when the wait passes the deadline', async () => {
  const { requests, run } = harness(async () => respond(429, { 'retry-after': '120' }));
  await assert.rejects(run(60_000), {
    _tag: 'ProverBusyError',
    name: 'ProverBusyError',
    code: 'PROVER_BUSY',
    retryAfterMs: 120_000,
  });
  assert.equal(requests.length, 1);
});

test('a down prover rejects as unavailable when the backoff passes the deadline', async () => {
  const { requests, run } = harness(async () => respond(503));
  await assert.rejects(run(10_000), { _tag: 'ProverUnavailableError', status: 503 });
  assert.equal(requests.length, 4);
});

test('a request in flight at the deadline is aborted and rejects with TimeoutError', async () => {
  let seen: HttpRequest | undefined;
  const { run } = harness((request) => {
    seen = request;
    return new Promise<HttpResponse>(() => {});
  });
  await assert.rejects(run(5000), { _tag: 'TimeoutError', afterMs: 5000 });
  assert.equal(seen?.signal?.aborted, true);
});

test('an abort during the call aborts the request and rejects with CancelledError', async () => {
  const during = new AbortController();
  const slow = harness(() => new Promise<HttpResponse>(() => {}));
  const running = slow.run(300_000, during.signal);
  assert.equal(slow.requests.length, 1);
  during.abort();
  await assert.rejects(running, { _tag: 'CancelledError', by: 'caller' });
  assert.equal(slow.requests[0]?.signal?.aborted, true);
});

test('an abort during a retry wait ends the wait and leaves no timer', async () => {
  const controller = new AbortController();
  const { clock, requests, run } = harness(
    async () => respond(503, { 'retry-after': '60' }),
    undefined,
    (ms) => ms === 60_000 && queueMicrotask(() => controller.abort()),
  );
  await assert.rejects(run(300_000, controller.signal), { _tag: 'CancelledError' });
  assert.equal(requests.length, 1);
  assert.equal(clock.pending(), 0);
});

test('an abort a few microtasks after the credential never sends on an ended call', async () => {
  for (let depth = 0; depth < 8; depth++) {
    const controller = new AbortController();
    const later = (n: number): void =>
      n === 0 ? controller.abort() : queueMicrotask(() => later(n - 1));
    const sentAborted: boolean[] = [];
    const { run } = harness(
      async (request) => {
        sentAborted.push(request.signal?.aborted ?? false);
        return respond(200);
      },
      async () => {
        later(depth);
        return 'token';
      },
    );
    await run(300_000, controller.signal).then(
      () => undefined,
      (error: unknown) => assert.equal(Reflect.get(error as object, '_tag'), 'CancelledError'),
    );
    assert.deepEqual(sentAborted.filter(Boolean), [], `depth ${depth}`);
  }
});

test('close clears the deadline timer and the caller listener', async () => {
  let listeners = 0;
  const signal = {
    aborted: false,
    addEventListener: () => {
      listeners++;
    },
    removeEventListener: () => {
      listeners--;
    },
  };
  const clock = virtualClock();
  const call = openCall(signal, 1000, clock);
  assert.equal(listeners, 1);
  call.close();
  assert.equal(listeners, 0);
  assert.equal(clock.pending(), 0);
  assert.equal(call.signal.aborted, true);
});

test('close rejects work still in flight with CancelledError, never with undefined', async () => {
  const call = openCall(undefined, 1000, virtualClock());
  const pending = untilEnded(call, () => new Promise<never>(() => {}));
  call.close();
  await assert.rejects(pending, (error) => error instanceof CancelledError);
});

test('a timeout that a host timer cannot hold throws RangeError', () => {
  for (const timeoutMs of [Infinity, Number.NaN, -1, 1.5, 2 ** 31]) {
    assert.throws(() => openCall(undefined, timeoutMs), RangeError, String(timeoutMs));
  }
});

test('the credential never reaches an error or a URL, and other platform errors are final', async () => {
  const secret = 'SECRET-credential';
  const cases: [() => Promise<HttpResponse>, string, number][] = [
    [async () => respond(401), 'ProverUnauthorizedError', 1],
    [async () => respond(503), 'ProverUnavailableError', 3],
    [() => Promise.reject(new NetworkError()), 'ProverUnavailableError', 3],
    [() => Promise.reject(new TypeError(`bad header ${secret}`)), 'ProverUnavailableError', 1],
  ];
  for (const [answer, tag, sent] of cases) {
    const { requests, run } = harness(answer, async () => secret);
    const error = await run(5000).then(
      () => assert.fail('no rejection'),
      (rejection: unknown) => rejection,
    );
    assert.ok(error instanceof Error);
    assert.equal(Reflect.get(error, '_tag'), tag);
    assert.equal(requests.length, sent, tag);
    assert.doesNotMatch(`${error.message} ${JSON.stringify(error)}`, /SECRET|bad header/);
    assert.doesNotMatch(inspect(error, { showHidden: true, depth: 5 }), /SECRET/);
    assert.equal(error.cause, undefined);
    for (const request of requests) assert.doesNotMatch(request.url, /SECRET/);
  }
});

test('a credential rejection passes through unchanged', async () => {
  const failure = new Error('no session');
  const { requests, run } = harness(
    async () => respond(200),
    () => Promise.reject(failure),
  );
  await assert.rejects(run(), (error: unknown) => error === failure);
  assert.equal(requests.length, 0);
});

test('a credential that never settles still ends at the deadline', async () => {
  const { run } = harness(
    async () => respond(200),
    () => new Promise<string>(() => {}),
  );
  await assert.rejects(run(1000), { _tag: 'TimeoutError' });
});

test('the service URL must be https, or http on a loopback host', () => {
  assert.equal(serviceUrl('https://prover.example/v1/'), 'https://prover.example/v1');
  assert.equal(serviceUrl('http://127.0.0.1:6300'), 'http://127.0.0.1:6300');
  assert.equal(serviceUrl('http://[::1]:6300/'), 'http://[::1]:6300');
  assert.equal(serviceUrl('http://localhost:6300'), 'http://localhost:6300');
  for (const url of [
    'http://prover.example',
    'http://localhost.example',
    'ftp://prover.example',
    'https://user:secret@prover.example',
    'https://prover.example/?token=1',
    'https://prover.example/#x',
    'https://',
    'prover.example',
  ]) {
    assert.throws(() => serviceUrl(url), TypeError, url);
  }
});
