import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PassportError } from '@midnight-ntwrk/mn-passport-core';
import { sponsorFees } from '@midnight-ntwrk/mn-passport-adapter-broadcast';
import { createStubPlatform } from '@midnight-ntwrk/mn-passport-dev';
import { REFUSALS } from './fixtures/sponsor-answers.js';
import { bind, hex, lastId, never, offline, provenTx, respond } from './support.js';

const URL = 'https://sponsor.example/api/midnight/sponsor';

async function setup(options: { requestTimeoutMs?: number } = {}) {
  const platform = createStubPlatform();
  const fees = sponsorFees({ url: URL, platform, ...options });
  const tx = await provenTx();
  return { platform, fees, tx };
}

type Refusal = PassportError & { action?: string; status?: number; retryAfterMs?: number };

async function rejection(run: () => Promise<unknown>): Promise<Refusal> {
  try {
    await run();
  } catch (error) {
    return error as Refusal;
  }
  assert.fail('expected a rejection');
}

test('pay posts the proven bytes and returns the sponsor bytes with their last identifier', async () => {
  const { platform, fees, tx } = await setup();
  const paid = bind(tx.bytes);
  platform.answer(async () => respond(200, JSON.stringify({ tx: hex(paid) })));
  const before = Date.now();
  const result = await fees.pay(tx);
  const after = Date.now();

  const request = platform.requests[0];
  assert.equal(request?.url, URL);
  assert.equal(request?.method, 'POST');
  assert.equal(request?.headers?.['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(String(request?.body)), { provenTx: hex(tx.bytes) });
  assert.equal(result.stage, 'paid');
  assert.deepEqual(result.bytes, paid);
  assert.equal(result.id, lastId(paid));
  assert.ok(result.submitBy !== undefined);
  assert.ok(result.submitBy >= before + 50_000 && result.submitBy <= after + 50_000);
});

for (const [answer, expected] of REFUSALS) {
  test(`a sponsor answer, ${answer.name}, gives ${expected.tag} (${expected.action})`, async () => {
    const { platform, fees, tx } = await setup();
    platform.answer(async () => respond(answer.status, answer.body, answer.headers));
    const error = await rejection(() => fees.pay(tx));
    assert.equal(error._tag, expected.tag);
    assert.equal(error.action, expected.action);
    assert.equal(error.status, expected.status);
    assert.equal(error.retryAfterMs, expected.retryAfterMs);
    assert.equal(platform.requests.length, 1);
  });
}

test('Retry-After as an HTTP date gives the time left', async () => {
  const { platform, fees, tx } = await setup();
  const at = new Date(Date.now() + 30_000).toUTCString();
  platform.answer(async () => respond(503, '{}', { 'Retry-After': at }));
  const { retryAfterMs } = await rejection(() => fees.pay(tx));
  assert.ok(retryAfterMs !== undefined && retryAfterMs > 25_000 && retryAfterMs <= 30_000);
});

test('no answer gives SponsorUnavailableError with retry', async () => {
  for (const handler of [offline, never]) {
    const { platform, fees, tx } = await setup({ requestTimeoutMs: 20 });
    platform.answer(handler);
    const error = await rejection(() => fees.pay(tx));
    assert.equal(error._tag, 'SponsorUnavailableError');
    assert.equal(error.action, 'retry');
  }
});

test('a 200 with a bad body gives SponsorUnavailableError with stop', async () => {
  const { platform, fees, tx } = await setup();
  const bodies = [
    'not json',
    '{}',
    JSON.stringify({ tx: 'abc' }),
    JSON.stringify({ tx: 42 }),
    JSON.stringify({ tx: hex(tx.bytes) }),
    JSON.stringify({ tx: 'ab'.repeat(40) }),
  ];
  for (const text of bodies) {
    platform.answer(async () => respond(200, text));
    const error = await rejection(() => fees.pay(tx));
    assert.equal(error._tag, 'SponsorUnavailableError', text);
    assert.equal(error.action, 'stop');
    assert.equal(error.status, 200);
  }
});

test('an unproven transaction throws TypeError before any request', async () => {
  const { platform, fees } = await setup();
  const { Transaction } = await import('@midnightntwrk/ledger-v9');
  const unproven = Transaction.fromParts('undeployed').serialize();
  await assert.rejects(() => fees.pay({ stage: 'proven', bytes: unproven }), TypeError);
  assert.equal(platform.requests.length, 0);
});

test('a runtime that fails to load sends no request', async () => {
  const { platform, fees, tx } = await setup();
  platform.loadFails(new Error('no WASM'));
  assert.equal((await rejection(() => fees.pay(tx)))._tag, 'UpstreamError');
  assert.equal(platform.requests.length, 0);
});

// The fees contract checks the CancelledError; this checks what reaches the network.
test('an abort before pay sends nothing, and one during pay aborts the request', async () => {
  const { platform, fees, tx } = await setup();
  const before = new AbortController();
  before.abort();
  await assert.rejects(fees.pay(tx, { signal: before.signal }));
  assert.equal(platform.requests.length, 0);

  platform.answer(never);
  const during = new AbortController();
  const running = fees.pay(tx, { signal: during.signal });
  while (platform.requests.length === 0) await new Promise((resolve) => setTimeout(resolve, 1));
  during.abort();
  await assert.rejects(running);
  assert.equal(platform.requests[0]?.signal?.aborted, true);
});

test('no error holds the body, the transaction, or a key', async () => {
  const { platform, fees, tx } = await setup();
  const secrets: [string, string] = [hex(tx.bytes), 'ab'.repeat(32)];
  const leaky = JSON.stringify({
    error: secrets[0],
    message: `failed for ${secrets[1]}`,
    details: secrets.join(' '),
    reason: secrets[1],
  });
  for (const status of [200, 429, 503]) {
    platform.answer(async () => respond(status, leaky, { 'retry-after': secrets[1] ?? '' }));
    const error = await rejection(() => fees.pay(tx));
    const seen = [
      error.message,
      error.stack ?? '',
      JSON.stringify(error),
      ...(Object.values(error) as unknown[]),
    ]
      .map(String)
      .join('\n');
    for (const secret of secrets) assert.ok(!seen.includes(secret), `status ${status} leaks`);
  }
});

test('the factory refuses a URL that is not https or loopback, and a bad duration', () => {
  const platform = createStubPlatform();
  for (const url of [
    'http://sponsor.example/x',
    'ftp://sponsor.example/x',
    'https://user:pw@sponsor.example/x',
    'https://sponsor.example/x#frag',
    'not a url',
  ]) {
    assert.throws(() => sponsorFees({ url, platform }), TypeError, url);
  }
  for (const url of ['http://localhost:8977/x', 'http://127.0.0.1/x', 'http://[::1]/x']) {
    assert.doesNotThrow(() => sponsorFees({ url, platform }), url);
  }
  assert.throws(() => sponsorFees({ url: URL, platform, paymentTtlMs: -1 }), RangeError);
  assert.throws(() => sponsorFees({ url: URL, platform, requestTimeoutMs: 1.5 }), RangeError);
});
