import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  ProverConsentRecordError,
  proverDisclosure,
  withProverConsent,
  type AcceptedDisclosure,
  type ConsentAnswer,
  type ConsentRecord,
  type Prover,
  type ProverDisclosure,
  type UnprovenTransaction,
} from '@midnight-ntwrk/mn-passport-core';

const T = { timeout: 2000 };
const tx: UnprovenTransaction = { stage: 'unproven', bytes: new Uint8Array([1, 2, 3]) };
const disclosure = proverDisclosure('Example Prover');

function recordingProver(): Prover & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    prove: async (unproven, circuitIds, options) => {
      calls.push([unproven, circuitIds, options]);
      return { stage: 'proven', bytes: unproven.bytes };
    },
  };
}

function memoryRecord(
  fail: { read?: boolean; write?: boolean } = {},
): ConsentRecord & { stored: AcceptedDisclosure | undefined } {
  const record = {
    stored: undefined as AcceptedDisclosure | undefined,
    read: async () => {
      if (fail.read) throw new Error('read failed');
      return record.stored;
    },
    write: async (accepted: AcceptedDisclosure) => {
      if (fail.write) throw new Error('write failed');
      record.stored = accepted;
    },
  };
  return record;
}

function deferredAsk() {
  const asked: ProverDisclosure[] = [];
  let answer: (a: ConsentAnswer) => void = () => {};
  const ask = (d: ProverDisclosure) => {
    asked.push(d);
    return new Promise<ConsentAnswer>((resolve) => (answer = resolve));
  };
  return { ask, asked, answer: (a: ConsentAnswer) => answer(a) };
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

test('no proof request reaches the prover before the user accepts', T, async () => {
  const prover = recordingProver();
  const { ask, asked, answer } = deferredAsk();
  const gated = withProverConsent({ prover, disclosure, ask, record: memoryRecord() });
  const options = { timeoutMs: 5000 };

  const result = gated.prove(tx, ['owner_call'], options);
  await tick();
  assert.equal(asked.length, 1);
  assert.equal(prover.calls.length, 0);

  answer('accepted');
  assert.deepEqual(await result, { stage: 'proven', bytes: tx.bytes });
  assert.deepEqual(prover.calls, [[tx, ['owner_call'], options]]);
});

test('a decline sends nothing, stores nothing, and the next call asks again', T, async () => {
  const prover = recordingProver();
  const record = memoryRecord();
  const { ask, asked, answer } = deferredAsk();
  const gated = withProverConsent({ prover, disclosure, ask, record });

  const first = gated.prove(tx, []);
  await tick();
  answer('declined');
  await assert.rejects(first, { _tag: 'ProverConsentDeclinedError', version: disclosure.version });
  assert.equal(record.stored, undefined);

  const second = gated.prove(tx, []);
  await tick();
  assert.equal(asked.length, 2);
  answer('accepted');
  await second;
  assert.equal(prover.calls.length, 1);
});

test('an accepted version is not asked again, from the stored record alone', T, async () => {
  const record = memoryRecord();
  let asks = 0;
  const ask = async (): Promise<ConsentAnswer> => {
    asks += 1;
    return 'accepted';
  };
  const gate = (d: ProverDisclosure): Prover =>
    withProverConsent({ prover: recordingProver(), disclosure: d, ask, record });

  await gate(disclosure).prove(tx, []);
  await gate(disclosure).prove(tx, []);
  assert.equal(asks, 1);

  await gate({ ...disclosure, version: '2' }).prove(tx, []);
  assert.equal(asks, 2);

  await gate({ ...disclosure, version: '2', operator: 'Other Prover' }).prove(tx, []);
  assert.equal(asks, 3);
});

test('two calls at once share one question', T, async () => {
  const prover = recordingProver();
  const { ask, asked, answer } = deferredAsk();
  const gated = withProverConsent({ prover, disclosure, ask, record: memoryRecord() });

  const both = Promise.all([gated.prove(tx, []), gated.prove(tx, [])]);
  await tick();
  answer('accepted');
  await both;
  assert.equal(asked.length, 1);
  assert.equal(prover.calls.length, 2);
});

test('a failing hook or record, or an answer but "accepted", sends nothing', T, async () => {
  const hookError = new Error('screen closed');
  const cases: {
    name: string;
    ask: () => Promise<ConsentAnswer>;
    record: ConsentRecord;
    expected: object;
  }[] = [
    {
      name: 'answer',
      ask: async () => true as unknown as ConsentAnswer,
      record: memoryRecord(),
      expected: { _tag: 'ProverConsentDeclinedError' },
    },
    {
      name: 'hook',
      ask: () => Promise.reject(hookError),
      record: memoryRecord(),
      expected: hookError,
    },
    {
      name: 'read',
      ask: async () => assert.fail('asked after a failed read'),
      record: memoryRecord({ read: true }),
      expected: { _tag: 'ProverConsentRecordError', step: 'read' },
    },
    {
      name: 'write',
      ask: async () => 'accepted',
      record: memoryRecord({ write: true }),
      expected: { _tag: 'ProverConsentRecordError', step: 'write' },
    },
  ];
  for (const c of cases) {
    const prover = recordingProver();
    const gated = withProverConsent({ prover, disclosure, ask: c.ask, record: c.record });
    const result = gated.prove(tx, []);
    await assert.rejects(result, c.expected, c.name);
    const error: unknown = await result.catch((e: unknown) => e);
    if (error instanceof ProverConsentRecordError) assert.ok(!('cause' in error), c.name);
    assert.equal(prover.calls.length, 0, c.name);
  }
});

test(
  'an abort while the hook waits rejects that caller, and the answer still counts',
  T,
  async () => {
    const prover = recordingProver();
    const record = memoryRecord();
    const { ask, asked, answer } = deferredAsk();
    const gated = withProverConsent({ prover, disclosure, ask, record });
    const controller = new AbortController();

    const aborted = gated.prove(tx, [], { signal: controller.signal });
    await tick();
    controller.abort();
    await assert.rejects(aborted, { _tag: 'CancelledError', by: 'caller' });
    const late = gated.prove(tx, [], { signal: controller.signal });
    await assert.rejects(late, { _tag: 'CancelledError', by: 'caller' });

    answer('accepted');
    await tick();
    assert.deepEqual(record.stored, { version: disclosure.version, operator: disclosure.operator });
    await gated.prove(tx, []);
    assert.equal(asked.length, 1);
    assert.equal(prover.calls.length, 1);
  },
);

test('a decline after every caller aborted is not an unhandled rejection', T, async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    const { ask, answer } = deferredAsk();
    const record = memoryRecord();
    const gated = withProverConsent({ prover: recordingProver(), disclosure, ask, record });
    const controller = new AbortController();
    const aborted = gated.prove(tx, [], { signal: controller.signal });
    await tick();
    controller.abort();
    await assert.rejects(aborted, { _tag: 'CancelledError' });
    answer('declined');
    await tick();
    await tick();
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

test('the disclosure names the operator, and a blank operator throws', T, () => {
  assert.ok(disclosure.short.includes('Example Prover'));
  assert.ok(disclosure.long.includes('Example Prover'));
  assert.equal(proverDisclosure('  Example Prover ').operator, 'Example Prover');
  assert.throws(() => proverDisclosure(' '), TypeError);
});

// A text change without a new version would not ask the user again.
const PINNED: Record<string, string> = {
  '1-draft': '3190ac9a2d86876c971897d9ed869ca5d8d78df9b7d14792ee4c69401921b33d',
};

test('each text version has a pinned hash', T, () => {
  const d = proverDisclosure('OPERATOR');
  const hash = createHash('sha256').update(`${d.short}\n${d.long}`).digest('hex');
  assert.equal(hash, PINNED[d.version], `the text of ${d.version} changed: give it a new version`);
});
