import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStateSource, UpstreamError } from '@midnight-ntwrk/mn-passport-core';

const upstream = () => {
  const state: {
    starts: number;
    stops: number;
    emit: (value: number) => void;
    fail: (error: UpstreamError) => void;
  } = { starts: 0, stops: 0, emit: () => {}, fail: () => {} };
  const source = createStateSource<number>((emit, fail) => {
    state.starts++;
    state.emit = emit;
    state.fail = fail;
    return () => state.stops++;
  });
  return { state, source };
};

test('current() and a new subscriber get the latest value', () => {
  const { state, source } = upstream();
  assert.equal(source.current(), undefined);
  source.subscribe(() => {});
  state.emit(1);
  state.emit(2);
  assert.equal(source.current(), 2);
  const seen: number[] = [];
  source.subscribe((v) => seen.push(v));
  assert.deepEqual(seen, [2]);
});

test('one upstream serves all; unsubscribe is idempotent; the last one stops it', () => {
  const { state, source } = upstream();
  const a = source.subscribe(() => {});
  const b = source.subscribe(() => {});
  assert.equal(state.starts, 1);
  a();
  a();
  assert.equal(state.stops, 0);
  b();
  assert.equal(state.stops, 1);
});

test('the last unsubscribe drops the value, and a late emit reaches nobody', () => {
  const { state, source } = upstream();
  const seen: number[] = [];
  const stop = source.subscribe((v) => seen.push(v));
  state.emit(1);
  const lateEmit = state.emit;
  stop();
  lateEmit(9);
  assert.deepEqual(seen, [1]);
  assert.equal(source.current(), undefined);
  const next: number[] = [];
  source.subscribe((v) => next.push(v));
  assert.deepEqual(next, []);
});

test('during an emit, a removed listener is skipped and a new one gets one replay', () => {
  const { state, source } = upstream();
  const seen: string[] = [];
  let stopB = (): void => {};
  source.subscribe((v) => {
    seen.push(`a${v}`);
    stopB();
    if (v === 1) source.subscribe((w) => seen.push(`c${w}`));
  });
  stopB = source.subscribe((v) => seen.push(`b${v}`));
  state.emit(1);
  // C gets 1 once, by replay. B is gone before its turn.
  assert.deepEqual(seen, ['a1', 'c1']);
});

test('a failure reaches onError typed', () => {
  const { state, source } = upstream();
  const errors: string[] = [];
  source.subscribe(
    () => {},
    (e) => errors.push(`${e._tag} ${e.code}`),
  );
  state.fail(new UpstreamError({ sourceTag: 'Indexer' }));
  assert.deepEqual(errors, ['UpstreamError UPSTREAM_FAILED']);
});

test('a listener that throws on replay leaves no subscriber behind', () => {
  const { state, source } = upstream();
  const stop = source.subscribe(() => {});
  state.emit(1);
  assert.throws(() =>
    source.subscribe(() => {
      throw new Error('listener');
    }),
  );
  stop();
  assert.equal(state.stops, 1);
});

test('a start that throws does not block the next subscribe', () => {
  let starts = 0;
  const source = createStateSource<number>(() => {
    if (++starts === 1) throw new Error('start');
    return () => {};
  });
  assert.throws(() => source.subscribe(() => {}));
  source.subscribe(() => {});
  assert.equal(starts, 2);
});

// Collects what the source rethrows in a microtask, instead of crashing the run.
const captureRethrows = (run: () => void): unknown[] => {
  const thrown: unknown[] = [];
  const original = globalThis.queueMicrotask;
  globalThis.queueMicrotask = (task) => {
    try {
      task();
    } catch (error) {
      thrown.push(error);
    }
  };
  try {
    run();
  } finally {
    globalThis.queueMicrotask = original;
  }
  return thrown;
};

test('a listener that throws on the first emit inside start does not leak the upstream', () => {
  let starts = 0;
  let stops = 0;
  const source = createStateSource<number>((emit) => {
    starts++;
    emit(1);
    return () => stops++;
  });
  let stop = (): void => {};
  const thrown = captureRethrows(() => {
    stop = source.subscribe(() => {
      throw new Error('listener');
    });
  });
  assert.equal(thrown.length, 1);
  stop();
  assert.equal(stops, 1);
  source.subscribe(() => {});
  assert.equal(starts, 2);
});

test('a listener that throws does not skip the later subscribers', () => {
  const { state, source } = upstream();
  const seen: number[] = [];
  source.subscribe(() => {
    throw new Error('first');
  });
  source.subscribe((v) => seen.push(v));
  const thrown = captureRethrows(() => state.emit(5));
  assert.equal(thrown.length, 1);
  assert.deepEqual(seen, [5]);
});

test('a late fail from a stopped run does not reach the next run', () => {
  const { state, source } = upstream();
  source.subscribe(() => {})();
  const lateFail = state.fail;
  const errors: string[] = [];
  source.subscribe(
    () => {},
    (e) => errors.push(e._tag),
  );
  lateFail(new UpstreamError({ sourceTag: 'Old' }));
  assert.deepEqual(errors, []);
});
