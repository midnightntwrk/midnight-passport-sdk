import type { PassportError } from './passport-error.js';

/** An observable read. It does not complete. */
export interface StateSource<A> {
  /** The latest value while the upstream runs, else `undefined`. It does not start the upstream. */
  current(): A | undefined;
  /** Calls `listener` at once when a value exists. The returned function is idempotent. */
  subscribe(listener: (value: A) => void, onError?: (error: PassportError) => void): () => void;
}

// The foundation has no platform types; every supported runtime has `queueMicrotask`.
const rethrowLater = (error: unknown): void =>
  (globalThis as typeof globalThis & { queueMicrotask(task: () => void): void }).queueMicrotask(
    () => {
      throw error;
    },
  );

// A throwing listener must not stop `start` or the other listeners.
const each = <T>(items: Iterable<T>, call: (item: T) => void): void => {
  for (const item of items) {
    try {
      call(item);
    } catch (error) {
      rethrowLater(error);
    }
  }
};

interface Subscriber<A> {
  readonly listener: (value: A) => void;
  readonly onError: ((error: PassportError) => void) | undefined;
}

/** `start` runs on the first subscription. The function it returns runs after the last unsubscribe. */
export function createStateSource<A>(
  start: (emit: (value: A) => void, fail: (error: PassportError) => void) => () => void,
): StateSource<A> {
  const subscribers = new Set<Subscriber<A>>();
  let latest: { readonly value: A } | undefined;
  let stop: (() => void) | undefined;
  // Each start gets its own run, so a late emit from a stopped upstream is dropped.
  let run = 0;

  const begin = (): void => {
    const mine = ++run;
    const emit = (value: A): void => {
      if (mine !== run) return;
      latest = { value };
      each([...subscribers], (s) => subscribers.has(s) && s.listener(value));
    };
    const fail = (error: PassportError): void => {
      if (mine !== run) return;
      each([...subscribers], (s) => subscribers.has(s) && s.onError?.(error));
    };
    const stopThis = start(emit, fail);
    if (mine === run) stop = stopThis;
    else stopThis();
  };

  return {
    current: () => latest?.value,
    subscribe(listener, onError) {
      const subscriber: Subscriber<A> = { listener, onError };
      let done = false;
      const unsubscribe = (): void => {
        if (done) return;
        done = true;
        subscribers.delete(subscriber);
        if (subscribers.size > 0) return;
        run++;
        latest = undefined;
        const stopNow = stop;
        stop = undefined;
        stopNow?.();
      };
      subscribers.add(subscriber);
      // A throw from the listener or from `start` must not leave the subscriber behind.
      try {
        if (latest) listener(latest.value);
        if (subscribers.size === 1 && stop === undefined) begin();
      } catch (error) {
        unsubscribe();
        throw error;
      }
      return unsubscribe;
    },
  };
}
