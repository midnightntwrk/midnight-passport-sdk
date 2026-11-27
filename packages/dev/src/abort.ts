import {
  CancelledError,
  TimeoutError,
  type AbortSignalLike,
} from '@midnight-ntwrk/mn-passport-core';

export function throwIfAborted(signal: AbortSignalLike | undefined): void {
  if (signal?.aborted) throw new CancelledError('caller');
}

/**
 * Runs `work` after a zero timer. An abort rejects the call until `work` settles, so a
 * pending `work` keeps the call in flight.
 */
export function inFlight<A>(
  signal: AbortSignalLike | undefined,
  work: () => A | PromiseLike<A>,
  timeoutMs?: number,
): Promise<A> {
  return new Promise<A>((resolve, reject) => {
    if (signal?.aborted) return reject(new CancelledError('caller'));
    const settle = (end: () => void): void => {
      clearTimeout(timer);
      clearTimeout(deadline);
      signal?.removeEventListener('abort', onAbort);
      end();
    };
    const onAbort = (): void => settle(() => reject(new CancelledError('caller')));
    const timer = setTimeout(() => {
      Promise.resolve()
        .then(work)
        .then(
          (value) => settle(() => resolve(value)),
          (error: unknown) => settle(() => reject(error)),
        );
    }, 0);
    const deadline =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => settle(() => reject(new TimeoutError(timeoutMs))), timeoutMs);
    signal?.addEventListener('abort', onAbort);
  });
}

/** After `next()`, the next `run` stays in flight until its signal aborts or its timeout ends. */
export function createHold() {
  let held = false;
  return {
    next(): void {
      held = true;
    },
    run<A>(
      signal: AbortSignalLike | undefined,
      work: () => A | PromiseLike<A>,
      timeoutMs?: number,
    ): Promise<A> {
      const hold = held;
      held = false;
      return inFlight(signal, hold ? () => new Promise<A>(() => {}) : work, timeoutMs);
    },
  };
}
