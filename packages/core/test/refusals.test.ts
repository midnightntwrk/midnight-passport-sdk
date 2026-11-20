import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NodeRefusedError,
  RefusalError,
  SponsorBusyError,
  SponsorCallerLimitError,
  SponsorNotAllowedError,
  SponsorOverCapError,
  SponsorUnavailableError,
  nodeRefusal,
  sponsorRefusal,
  type NodeRefusalReason,
  type RefusalAction,
  type SponsorAnswer,
} from '@midnight-ntwrk/mn-passport-core';

describe('each refusal class', () => {
  const samples: readonly (readonly [RefusalError | undefined, string, string])[] = [
    [sponsorRefusal({ status: 503 }), 'SponsorBusyError', 'SPONSOR_BUSY'],
    [
      sponsorRefusal({ status: 422, reason: 'over-fee-cap' }),
      'SponsorOverCapError',
      'SPONSOR_OVER_CAP',
    ],
    [sponsorRefusal({ status: 422 }), 'SponsorNotAllowedError', 'SPONSOR_NOT_ALLOWED'],
    [sponsorRefusal({ status: 429 }), 'SponsorCallerLimitError', 'SPONSOR_CALLER_LIMIT'],
    [sponsorRefusal({ status: 500 }), 'SponsorUnavailableError', 'SPONSOR_UNAVAILABLE'],
    [nodeRefusal(['Custom error: 170']), 'NodeRefusedError', 'NODE_REFUSED'],
  ];

  for (const [error, name, code] of samples) {
    test(name, () => {
      assert.ok(error instanceof RefusalError);
      assert.ok(error instanceof Error);
      assert.equal(error.code, code);
      assert.equal(error._tag, name);
      assert.equal(error.name, name);
      assert.ok(error.stack?.startsWith(`${name}: `));
    });
  }
});

describe('sponsorRefusal', () => {
  type Refusal = abstract new (...args: never[]) => RefusalError;
  const rows: readonly (readonly [SponsorAnswer, Refusal, RefusalAction])[] = [
    [{ status: 503 }, SponsorBusyError, 'retry'],
    [{ status: 422 }, SponsorNotAllowedError, 'stop'],
    [{ status: 422, reason: 'not-allowed' }, SponsorNotAllowedError, 'stop'],
    [{ status: 400 }, SponsorNotAllowedError, 'stop'],
    [{ status: 404 }, SponsorNotAllowedError, 'stop'],
    [{ status: 199 }, SponsorNotAllowedError, 'stop'],
    [{ status: 300 }, SponsorNotAllowedError, 'stop'],
    [{ status: 422, reason: 'over-fee-cap' }, SponsorOverCapError, 'stop'],
    [{ status: 429 }, SponsorCallerLimitError, 'stop'],
    [{ status: 500 }, SponsorUnavailableError, 'stop'],
    [{ status: 501 }, SponsorUnavailableError, 'stop'],
    [{ status: 507 }, SponsorUnavailableError, 'stop'],
    [{ status: 502 }, SponsorUnavailableError, 'retry'],
    [{ status: 504 }, SponsorUnavailableError, 'retry'],
    [{}, SponsorUnavailableError, 'retry'],
  ];

  for (const [answer, type, action] of rows) {
    test(`status ${String(answer.status)}, reason ${String(answer.reason)}`, () => {
      const error = sponsorRefusal(answer);
      assert.ok(error instanceof type);
      assert.equal(error.action, action);
      assert.equal(error.status, answer.status);
    });
  }

  test('a 2xx answer is not a refusal', () => {
    assert.equal(sponsorRefusal({ status: 200 }), undefined);
    assert.equal(sponsorRefusal({ status: 204 }), undefined);
  });

  test('a status that is not an integer stops, and keeps no status', () => {
    for (const status of [Number.NaN, 503.5]) {
      const error = sponsorRefusal({ status });
      assert.ok(error instanceof SponsorUnavailableError);
      assert.equal(error.action, 'stop');
      assert.equal(error.status, undefined);
    }
  });

  test('a retry wait that is not a plain number is dropped', () => {
    const error = sponsorRefusal({ status: 503, retryAfterMs: Number.NaN });
    assert.ok(error instanceof SponsorBusyError);
    assert.equal(error.retryAfterMs, undefined);
  });

  test('busy and caller limit keep the retry wait', () => {
    const busy = sponsorRefusal({ status: 503, retryAfterMs: 2000 });
    const limit = sponsorRefusal({ status: 429, retryAfterMs: 60_000 });
    assert.ok(busy instanceof SponsorBusyError);
    assert.ok(limit instanceof SponsorCallerLimitError);
    assert.equal(busy.retryAfterMs, 2000);
    assert.equal(limit.retryAfterMs, 60_000);
  });
});

describe('nodeRefusal', () => {
  const codes: readonly (readonly [number, NodeRefusalReason, RefusalAction, boolean])[] = [
    [228, 'expired-intent', 'rebuild', true],
    [242, 'expired-intent', 'rebuild', true],
    [104, 'stale-state', 'rebuild', true],
    [170, 'dust-proof-refused', 'rebuild', false],
    [196, 'dust-double-spend', 'rebuild', false],
    [138, 'fee-too-low', 'stop', false],
    [232, 'over-block-limit', 'stop', false],
    [239, 'unknown', 'stop', false],
  ];

  for (const [code, reason, action, newProof] of codes) {
    test(`code ${String(code)}`, () => {
      // The form that midnight-js passes on, after it sanitizes the cause.
      const error = nodeRefusal([
        `Error: 1010: Invalid Transaction: Custom error: ${String(code)}`,
      ]);
      assert.ok(error instanceof NodeRefusedError);
      assert.equal(error.reason, reason);
      assert.equal(error.action, action);
      assert.equal(error.newProof, newProof);
      assert.equal(error.nodeCode, code);
    });
  }

  const texts: readonly (readonly [string, NodeRefusalReason])[] = [
    ['1010: Invalid Transaction: Transaction would exhaust the block limits', 'over-block-limit'],
    ['1010: Invalid Transaction', 'unknown'],
    ['Custom error: 999', 'unknown'],
    ['Custom error: 1700', 'unknown'],
    ['Custom error: 0x8a', 'unknown'],
    ['Custom error: 0e4', 'unknown'],
    ['Custom error: 138abcdef', 'unknown'],
  ];

  for (const [message, reason] of texts) {
    test(message, () => {
      const error = nodeRefusal([message]);
      assert.ok(error instanceof NodeRefusedError);
      assert.equal(error.reason, reason);
      assert.equal(error.action, 'stop');
      assert.equal(error.newProof, false);
      assert.equal(error.nodeCode, undefined);
    });
  }

  test('reads past an outer message with no code', () => {
    const error = nodeRefusal([
      'ProviderFailedError: submitTx rejected the transaction',
      'Error: 1010: Invalid Transaction: Custom error: 228',
    ]);
    assert.equal(error?.reason, 'expired-intent');
    assert.equal(error?.nodeCode, 228);
  });

  test('a chain with no code or known text is unknown', () => {
    const error = nodeRefusal([
      'ProviderFailedError: submitTx rejected the transaction',
      'Error: socket hang up',
    ]);
    assert.equal(error?.reason, 'unknown');
    assert.equal(nodeRefusal([])?.reason, 'unknown');
  });

  test('a transaction the node already holds is not a refusal', () => {
    assert.equal(nodeRefusal(['1013: Transaction Already Imported']), undefined);
    assert.equal(
      nodeRefusal(['ProviderFailedError: submitTx failed', '1013: Transaction Already Imported']),
      undefined,
    );
  });
});

describe('no refusal holds the transaction or a key', () => {
  const transaction = 'ab'.repeat(512);
  const key = 'cd'.repeat(32);

  const holds = (error: Error | undefined): boolean => {
    assert.ok(error);
    const text = [
      error.message,
      error.stack ?? '',
      JSON.stringify(error),
      ...Object.getOwnPropertyNames(error).map((name) => String(Reflect.get(error, name))),
    ].join('\n');
    return text.includes(transaction) || text.includes(key);
  };

  test('sponsor answers', () => {
    // An untyped body can put text in a number field.
    const body = {
      reason: transaction,
      message: transaction,
      details: key,
      retryAfterMs: transaction as never,
    };
    assert.equal(holds(sponsorRefusal(body)), false);
    for (const status of [400, 422, 429, 500, 503, transaction as never]) {
      assert.equal(holds(sponsorRefusal({ ...body, status })), false);
    }
  });

  test('node messages', () => {
    for (const text of [
      'Custom error: 170',
      'would exhaust the block limits',
      'Invalid Transaction',
    ]) {
      assert.equal(holds(nodeRefusal([`1010: ${text} ${transaction} ${key}`])), false);
    }
  });
});
