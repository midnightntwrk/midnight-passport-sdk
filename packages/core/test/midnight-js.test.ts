import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { inspect } from 'node:util';
import { Cause, Effect, Exit, Fiber } from 'effect';
import { fromPromise, fromV3, type AbortSignalLike, type V3Runner } from '../dist/midnight-js.js';
import { UpstreamError } from '../dist/upstream-error.js';

// The root `effect` is Effect 4. compact-js resolves its own Effect 3 copy.
const fromCompactJs = createRequire(
  createRequire(import.meta.url).resolve('@midnight-ntwrk/compact-js/package.json'),
);

interface Effect3 extends V3Runner {
  succeed(value: unknown): unknown;
  fail(error: unknown): unknown;
  die(defect: unknown): unknown;
  sleep(millis: number): unknown;
  readonly interrupt: unknown;
  promise(evaluate: () => Promise<void>): unknown;
  ensuring(self: unknown, finalizer: unknown): unknown;
}

const v3 = fromCompactJs('effect') as { readonly Effect: Effect3 };
const E3 = v3.Effect;

test('Effect 3 comes from compact-js and Effect 4 from the root', () => {
  const versionOf = (load: NodeJS.Require): string =>
    (load('effect/package.json') as { version: string }).version;
  assert.match(versionOf(fromCompactJs), /^3\./);
  assert.match(versionOf(createRequire(import.meta.url)), /^4\./);
});

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 10));

// A lost abort signal makes an interrupt wait for the upstream, so these tests
// have a timeout. Effect 3's `never` keeps the process alive, so the upstream
// is a sleep that ends after the timeout.
const INTERRUPT = { timeout: 2_000 };
const blocked = E3.sleep(5_000);

const interruptAfterStart = async <A, E>(effect: Effect.Effect<A, E>): Promise<Exit.Exit<A, E>> => {
  const fiber = Effect.runFork(effect);
  await tick();
  await Effect.runPromise(Fiber.interrupt(fiber));
  return Effect.runPromiseExit(Fiber.join(fiber));
};

// A transaction failure can carry the transaction and a signing key.
class TxFailedError extends Error {
  readonly code = 'MIDNIGHT_JS_TX_FAILED';
  readonly record = { tx: new Uint8Array([0xde, 0xad, 0xbe, 0xef]) };
  constructor() {
    super('tx failed, key KEY-SECRET');
    this.name = 'TxFailedError';
    Object.defineProperty(this, 'signingKey', { value: 'KEY-SECRET', enumerable: false });
  }
}

const viewsOf = (error: Error): string[] => [
  JSON.stringify(error),
  inspect(error, { showHidden: true, depth: null }),
  String(error),
  ...Object.getOwnPropertyNames(error).map((key) => String(Reflect.get(error, key))),
];

// The stack holds paths and line numbers, so the byte needles skip it.
const byteViewsOf = (error: Error): string[] =>
  viewsOf(error).map((view) => view.replaceAll(error.stack ?? '', ''));

test('fromV3: success', async () => {
  assert.equal(await Effect.runPromise(fromV3<number>(E3, () => E3.succeed(7))), 7);
});

test('fromV3: a typed failure is caught by its tag', async () => {
  const program = fromV3(E3, () => E3.fail({ _tag: 'ContractRuntimeError', message: 'boom' })).pipe(
    Effect.catchTag('UpstreamError', (e) => Effect.succeed([e.sourceTag, e.message])),
  );
  assert.deepEqual(await Effect.runPromise(program), [
    'ContractRuntimeError',
    'An upstream call failed (ContractRuntimeError).',
  ]);
});

// The defect is checked as an `UpstreamError`, and through every view of it.
const scrubbedDefect = (exit: Exit.Exit<unknown, unknown>, sourceTag: string): void => {
  assert.ok(Exit.isFailure(exit) && Cause.hasDies(exit.cause) && !Cause.hasFails(exit.cause));
  const defect = Cause.squash(exit.cause);
  assert.ok(defect instanceof UpstreamError);
  assert.equal(defect.sourceTag, sourceTag);
  for (const view of viewsOf(defect)) assert.doesNotMatch(view, /KEY-SECRET|tx failed|unreadable/);
};

test('fromV3: a defect crosses as an UpstreamError, without the upstream object', async () => {
  const exit = await Effect.runPromiseExit(fromV3(E3, () => E3.die(new TxFailedError())));
  scrubbedDefect(exit, 'TxFailedError');
});

test('fromV3: a runner that rejects or a make that throws is a scrubbed defect', async () => {
  const rejects: V3Runner = { runPromiseExit: () => Promise.reject(new TxFailedError()) };
  scrubbedDefect(await Effect.runPromiseExit(fromV3(rejects, () => undefined)), 'TxFailedError');
  const throws = (): never => {
    throw new TxFailedError();
  };
  scrubbedDefect(await Effect.runPromiseExit(fromV3(E3, throws)), 'TxFailedError');
});

test('fromV3: a failure followed by a defect is caught as a failure', async () => {
  const program = fromV3(E3, () =>
    E3.ensuring(E3.fail({ _tag: 'First' }), E3.die(new Error('finalizer'))),
  ).pipe(Effect.catchTag('UpstreamError', (e) => Effect.succeed(e.sourceTag)));
  assert.equal(await Effect.runPromise(program), 'First');
});

test('fromV3: an Effect 3 interruption is an Effect 4 interruption', async () => {
  const exit = await Effect.runPromiseExit(fromV3(E3, () => E3.interrupt));
  assert.ok(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause));
});

for (const [label, exit] of [
  ['an empty cause', { _tag: 'Failure', cause: { _tag: 'Empty' } }],
  ['no exit', undefined],
  ['an exit of the wrong shape', { value: 1 }],
] as [string, unknown][]) {
  test(`fromV3: ${label} is a defect, not an interrupt`, async () => {
    const runner: V3Runner = { runPromiseExit: () => Promise.resolve(exit) };
    const result = await Effect.runPromiseExit(fromV3(runner, () => undefined));
    assert.ok(Exit.isFailure(result) && Cause.hasDies(result.cause));
    assert.ok(!Cause.hasInterrupts(result.cause));
  });
}

test('fromV3: an interrupt returns after the Effect 3 finalizer finishes', INTERRUPT, async () => {
  let finalized = false;
  const finalizer = E3.promise(async () => {
    await tick();
    finalized = true;
  });
  const exit = await interruptAfterStart(fromV3(E3, () => E3.ensuring(blocked, finalizer)));
  assert.equal(finalized, true);
  assert.ok(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause));
});

test('fromV3: a defect from an Effect 3 finalizer survives the interrupt', INTERRUPT, async () => {
  const finalizer = E3.die(new TxFailedError());
  const exit = await interruptAfterStart(fromV3(E3, () => E3.ensuring(blocked, finalizer)));
  scrubbedDefect(exit, 'TxFailedError');
});

test('fromPromise: success', async () => {
  assert.equal(await Effect.runPromise(fromPromise(() => Promise.resolve('ok'))), 'ok');
});

test('fromPromise: a rest-parameter function still gets the signal', async () => {
  const run = (...args: AbortSignalLike[]): Promise<boolean> =>
    Promise.resolve(args[0] !== undefined);
  assert.equal(await Effect.runPromise(fromPromise(run)), true);
});

test('fromPromise: a typed failure is caught by its tag and keeps its code', async () => {
  const rejection = Object.assign(new Error('bad argument'), {
    code: 'MIDNIGHT_JS_G_INVALID_ARGUMENT',
  });
  const program = fromPromise(() => Promise.reject(rejection)).pipe(
    Effect.catchTag('UpstreamError', (e) => Effect.succeed([e.sourceTag, e.sourceCode])),
  );
  assert.deepEqual(await Effect.runPromise(program), ['Error', 'MIDNIGHT_JS_G_INVALID_ARGUMENT']);
});

test('fromPromise: a reason that cannot be read is a defect, without the getter error', async () => {
  const unreadable = {
    get _tag(): string {
      throw new Error('unreadable');
    },
  };
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- The test rejects with a non-Error on purpose.
  const exit = await Effect.runPromiseExit(fromPromise(() => Promise.reject(unreadable)));
  scrubbedDefect(exit, 'unknown');
});

test('fromPromise: interruption aborts the signal', INTERRUPT, async () => {
  let aborted = (): void => {};
  const ran = new Promise<void>((resolve) => (aborted = resolve));
  const exit = await interruptAfterStart(
    fromPromise((signal) => new Promise<never>(() => signal.addEventListener('abort', aborted))),
  );
  await ran;
  assert.ok(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause));
});

test('UpstreamError keeps no upstream object, key, or text', async () => {
  const error = await Effect.runPromise(
    Effect.flip(fromPromise(() => Promise.reject(new TxFailedError()))),
  );
  assert.equal(error.cause, undefined);
  assert.deepEqual([error.sourceTag, error.sourceCode], ['TxFailedError', 'MIDNIGHT_JS_TX_FAILED']);
  for (const view of viewsOf(error)) assert.doesNotMatch(view, /KEY-SECRET|tx failed/);
  for (const view of byteViewsOf(error)) assert.doesNotMatch(view, /222|de ad/);
});

test('UpstreamError drops a string rejection, and an identifier that is long, not plain, or hex', async () => {
  const fromString = await Effect.runPromise(
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- The test rejects with a non-Error on purpose.
    Effect.flip(fromPromise(() => Promise.reject('seed words here'))),
  );
  assert.equal(fromString.sourceTag, 'unknown');
  for (const view of viewsOf(fromString)) assert.doesNotMatch(view, /seed words/);

  for (const [reason, sourceCode] of [
    [{ _tag: 'a secret phrase', code: 'x'.repeat(49) }, undefined],
    [{ _tag: 'deadbeef'.repeat(4), code: 'ab'.repeat(32) }, undefined],
    [{ _tag: `0x${'AB'.repeat(16)}`, code: 'MIDNIGHT_JS_TX_FAILED' }, 'MIDNIGHT_JS_TX_FAILED'],
  ] as const) {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- The test rejects with a non-Error on purpose.
    const error = await Effect.runPromise(Effect.flip(fromPromise(() => Promise.reject(reason))));
    assert.deepEqual([error.sourceTag, error.sourceCode], ['unknown', sourceCode], reason._tag);
  }
});
