import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CallFailedError,
  CancelledError,
  PaymentExpiredError,
  TimeoutError,
  createSender,
  createStateSource,
  nodeRefusal,
  sponsorRefusal,
  type Indexer,
  type Lookup,
  type PaidTransaction,
  type ProvenTransaction,
  type SendLimits,
  type TransactionResult,
  type TransactionStatus,
} from '@midnight-ntwrk/mn-passport-core';

// Each refusal comes from a recorded answer, through the mapping that the adapters use.
const node = (code: number) => {
  const refusal = nodeRefusal([`1010: Invalid Transaction: Custom error: ${code}`]);
  assert.ok(refusal);
  return refusal;
};
const sponsor = (status?: number, retryAfterMs?: number) => {
  const refusal = sponsorRefusal({
    ...(status === undefined ? {} : { status }),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  });
  assert.ok(refusal);
  return refusal;
};

type Outcome = 'block' | 'call-failed' | 'lost' | 'final-timeout' | Error;

const status = (
  id: string,
  level: 'in-block' | 'final',
  result: TransactionResult = 'succeeded',
): TransactionStatus => ({
  id,
  level,
  block: { height: 1, hash: 'ab'.repeat(32) },
  result: level === 'final' ? result : undefined,
});

/** Fakes that follow a script: one sponsor answer and one node outcome for each payment. */
function harness(script: {
  pays?: (Error | 'pay')[];
  submits?: Outcome[];
  /** What a wait on a known id gives, when it does not land. */
  resubmit?: Error;
  submitDelayMs?: number;
}) {
  const pays = [...(script.pays ?? [])];
  const submits = [...(script.submits ?? [])];
  const log = {
    events: [] as string[],
    builds: 0,
    paid: [] as string[],
    submitted: [] as string[],
    proofs: [] as ProvenTransaction[],
  };
  const finals = new Map<string, TransactionStatus>();
  const listeners = new Set<() => void>();
  const land = (id: string, result?: TransactionResult): void => {
    finals.set(id, status(id, 'final', result));
    for (const listener of listeners) listener();
  };
  const indexer: Indexer = {
    contractState: async () => undefined,
    transaction: async (id) => finals.get(id),
    watchContract: () => createStateSource(() => () => {}),
    watchTransaction: (id) =>
      createStateSource<Lookup<TransactionStatus>>((emit) => {
        const push = (): void => {
          const found = finals.get(id);
          emit(found ? { found: true, value: found } : { found: false });
        };
        push();
        listeners.add(push);
        return () => void listeners.delete(push);
      }),
  };
  const sender = (limits?: SendLimits) =>
    createSender(
      {
        fees: {
          async pay(tx) {
            log.proofs.push(tx);
            const next = pays.shift() ?? 'pay';
            if (next instanceof Error) throw next;
            const id = (log.paid.length + 1).toString(16).padStart(66, '0');
            log.paid.push(id);
            return { stage: 'paid', bytes: tx.bytes, id, submitBy: undefined };
          },
        },
        broadcast: {
          async submit(tx: PaidTransaction, { until, timeoutMs, signal }) {
            if (until === 'final') {
              const final = finals.get(tx.id);
              if (final) return final;
              throw new TimeoutError(timeoutMs);
            }
            if (log.submitted.includes(tx.id)) {
              // As the adapter does: a known id is not sent again, only waited on.
              if (script.resubmit) throw script.resubmit;
              await new Promise((resolve) => setTimeout(resolve, timeoutMs));
              log.events.push(`waited ${tx.id}`);
              if (finals.has(tx.id)) return status(tx.id, 'in-block');
              throw new TimeoutError(timeoutMs);
            }
            log.submitted.push(tx.id);
            await new Promise((resolve, reject) => {
              setTimeout(resolve, script.submitDelayMs ?? 0);
              signal?.addEventListener('abort', () => reject(new CancelledError('caller')));
            });
            log.events.push(`submitted ${tx.id}`);
            const next = submits.shift() ?? 'block';
            if (next instanceof Error) throw next;
            if (next === 'lost') throw new TimeoutError(timeoutMs);
            if (next === 'block') land(tx.id);
            if (next === 'call-failed') land(tx.id, 'partly-failed');
            return status(tx.id, 'in-block');
          },
        },
        indexer,
      },
      { lostWaitMs: 30, ...limits },
    );
  const build = async (): Promise<ProvenTransaction> => {
    log.builds++;
    log.events.push(`build ${log.builds}`);
    return { stage: 'proven', bytes: Uint8Array.of(log.builds) };
  };
  return { sender, build, log, land, watchers: () => listeners.size };
}

const send = (
  h: ReturnType<typeof harness>,
  until: 'in-block' | 'final' = 'final',
  limits?: SendLimits,
) => h.sender(limits).send(h.build, { account: 'aa', until, timeoutMs: 50 });

const it = (name: string, run: () => Promise<void> | void): void => {
  test(name, { timeout: 5_000 }, run);
};
const rejectsWith = (tag: string) => (e: Error & { _tag?: string }) => e._tag === tag;

it('a sponsor retry row pays the same proof again after its wait', async () => {
  for (const refusal of [sponsor(503, 5), sponsor(undefined)]) {
    const h = harness({ pays: [refusal] });
    assert.equal((await send(h, 'final', {})).level, 'final');
    assert.equal(h.log.builds, 1);
    assert.equal(h.log.proofs.length, 2);
  }
});

it('sponsor retries stop at their bound with the last refusal', async () => {
  const h = harness({ pays: [sponsor(503, 1), sponsor(503, 1), sponsor(503, 1)] });
  await assert.rejects(send(h, 'final', { sponsorRetries: 2 }), rejectsWith('SponsorBusyError'));
  assert.equal(h.log.submitted.length, 0);
});

it('a sponsor stop row throws at once', async () => {
  for (const [refusal, tag] of [
    [sponsor(422), 'SponsorNotAllowedError'],
    [sponsor(429), 'SponsorCallerLimitError'],
    [sponsor(500), 'SponsorUnavailableError'],
  ] as const) {
    const h = harness({ pays: [refusal] });
    await assert.rejects(send(h), rejectsWith(tag));
    assert.equal(h.log.proofs.length, 1);
  }
});

it('an abort during a sponsor wait rejects at once', async () => {
  const h = harness({ pays: [sponsor(503, 10_000)] });
  const controller = new AbortController();
  const done = h
    .sender()
    .send(h.build, { account: 'aa', until: 'final', timeoutMs: 50, signal: controller.signal });
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(done, rejectsWith('CancelledError'));
});

it('a node rebuild row with a new proof builds again, and no paid bytes go twice', async () => {
  const h = harness({ submits: [node(104)] });
  assert.equal((await send(h)).level, 'final');
  assert.equal(h.log.builds, 2);
  assert.deepEqual(
    h.log.submitted,
    ['1', '2'].map((n) => n.padStart(66, '0')),
  );
});

it('a node rebuild row with no new proof pays the same proof again', async () => {
  for (const code of [170, 196]) {
    const h = harness({ submits: [node(code)] });
    await send(h);
    assert.equal(h.log.builds, 1);
    assert.equal(new Set(h.log.submitted).size, 2);
    assert.deepEqual(h.log.proofs[0], h.log.proofs[1]);
  }
});

it('a node stop row throws', async () => {
  const h = harness({ submits: [node(239)] });
  await assert.rejects(send(h), rejectsWith('NodeRefusedError'));
  assert.equal(h.log.paid.length, 1);
});

it('a lost payment is paid again only after the adapter says that it expired', async () => {
  const h = harness({ submits: ['lost', node(104)], resubmit: new PaymentExpiredError(true) });
  assert.equal((await send(h)).level, 'final');
  assert.equal(h.log.paid.length, 3);
  assert.equal(h.log.builds, 2);
});

it('a lost payment that can still land is never paid again, and the proof is not built again', async () => {
  const h = harness({ submits: ['lost'] });
  await assert.rejects(send(h), rejectsWith('SendUncertainError'));
  assert.equal(h.log.paid.length, 1);
  assert.equal(h.log.builds, 1);
});

it('after an abort during the submit, the slot is held by a wait that never sends', async () => {
  const h = harness({ submitDelayMs: 20 });
  const sender = h.sender();
  const controller = new AbortController();
  const options = { account: 'aa', until: 'in-block', timeoutMs: 50 } as const;
  const first = sender.send(h.build, { ...options, signal: controller.signal });
  const abortAt = Date.now() + 5;
  setTimeout(() => controller.abort(), 5);
  let secondAt = 0;
  const second = sender.send(async () => ((secondAt = Date.now()), h.build()), options);
  await assert.rejects(first, rejectsWith('CancelledError'));
  await second;
  assert.ok(secondAt - abortAt >= 25, 'the slot was held for the indexer wait');
  assert.deepEqual(h.log.submitted, [...new Set(h.log.submitted)]);
  assert.equal(h.log.submitted.length, 2);
  assert.ok(
    !h.log.events.includes(`waited ${String(h.log.paid[0])}`),
    'the held wait sent nothing',
  );
});

it('a refusal during the wait on a lost payment takes the action table', async () => {
  const h = harness({ submits: ['lost'], resubmit: node(170) });
  assert.equal((await send(h)).level, 'final');
  assert.equal(h.log.paid.length, 2);
});

it('rebuilds stop at their bound', async () => {
  const h = harness({ submits: [node(170), node(170), node(170)] });
  await assert.rejects(send(h, 'final', { rebuilds: 2 }), rejectsWith('NodeRefusedError'));
  assert.equal(h.log.paid.length, 3);
});

it('a timeout after in-block goes to the caller, who can wait with final', async () => {
  const h = harness({ submits: ['final-timeout'] });
  const ids: string[] = [];
  const sender = h.sender();
  await assert.rejects(
    sender.send(h.build, {
      account: 'aa',
      until: 'final',
      timeoutMs: 20,
      onSubmitted: (id) => ids.push(id),
    }),
    rejectsWith('TimeoutError'),
  );
  assert.deepEqual(ids, h.log.paid);
  const [id] = ids;
  assert.ok(id !== undefined);
  setTimeout(() => h.land(id), 5);
  assert.equal((await sender.final(id, { timeoutMs: 1_000 })).level, 'final');
  // Already final: the watch emits inside `subscribe`, and must still stop.
  assert.equal((await sender.final(id, { timeoutMs: 1_000 })).level, 'final');
  assert.equal(h.watchers(), 0);
  await assert.rejects(sender.final('ff', { timeoutMs: 10 }), rejectsWith('TimeoutError'));
});

it('a final call that failed rejects with its status, and is not paid or built again', async () => {
  const h = harness({ submits: ['call-failed'] });
  const sender = h.sender();
  const failed = (e: unknown) =>
    e instanceof CallFailedError && e.status.result === 'partly-failed';
  await assert.rejects(
    sender.send(h.build, { account: 'aa', until: 'final', timeoutMs: 50 }),
    failed,
  );
  assert.equal(h.log.paid.length, 1);
  assert.equal(h.log.builds, 1);
  const [id] = h.log.paid;
  assert.ok(id !== undefined);
  await assert.rejects(sender.final(id, { timeoutMs: 1_000 }), failed);
});

it('a send at in-block resolves before final', async () => {
  const h = harness({ submits: ['final-timeout'] });
  assert.equal((await send(h, 'in-block')).level, 'in-block');
});

it('two sends for one account never overlap, and two accounts do', async () => {
  const h = harness({ submitDelayMs: 10 });
  const sender = h.sender();
  const events = h.log.events;
  const slow = (name: string) => async (): Promise<ProvenTransaction> => {
    events.push(`${name} start`);
    await new Promise((resolve) => setTimeout(resolve, 10));
    events.push(`${name} built`);
    return { stage: 'proven', bytes: Uint8Array.of(1) };
  };
  const one = sender.send(slow('a1'), { account: 'aa', until: 'in-block', timeoutMs: 50 });
  const two = sender.send(slow('a2'), { account: 'aa', until: 'in-block', timeoutMs: 50 });
  const other = sender.send(slow('b1'), { account: 'bb', until: 'in-block', timeoutMs: 50 });
  const [first] = await Promise.all([one, two, other]);
  assert.ok(events.indexOf('a2 start') > events.indexOf(`submitted ${first.id}`));
  assert.ok(events.indexOf('b1 start') < events.indexOf('a1 built'));
});

it('a failure or an abort in the queue frees the slot', async () => {
  const h = harness({ pays: [sponsor(422)] });
  const sender = h.sender();
  const failed = sender.send(h.build, { account: 'aa', until: 'in-block', timeoutMs: 50 });
  const controller = new AbortController();
  const queued = sender.send(h.build, {
    account: 'aa',
    until: 'in-block',
    timeoutMs: 50,
    signal: controller.signal,
  });
  controller.abort();
  const next = sender.send(h.build, { account: 'aa', until: 'in-block', timeoutMs: 50 });
  await assert.rejects(failed, rejectsWith('SponsorNotAllowedError'));
  await assert.rejects(queued, rejectsWith('CancelledError'));
  assert.equal((await next).level, 'in-block');
});

it('bad limits throw RangeError, and a bad timeoutMs rejects before any build', async () => {
  const h = harness({});
  assert.throws(() => h.sender({ rebuilds: -1 }), RangeError);
  assert.throws(() => h.sender({ sponsorRetries: 1.5 }), RangeError);
  assert.throws(() => h.sender({ lostWaitMs: -1 }), RangeError);
  assert.throws(() => h.sender({ lostWaitMs: 2 ** 31 }), RangeError);
  for (const timeoutMs of [1.5, -1]) {
    const bad = h.sender().send(h.build, { account: 'aa', until: 'in-block', timeoutMs });
    await assert.rejects(bad, RangeError);
  }
  assert.equal(h.log.builds, 0);
});
