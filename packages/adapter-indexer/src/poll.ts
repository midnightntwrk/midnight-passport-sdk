import {
  IndexerUnreachableError,
  PassportError,
  type CallOptions,
} from '@midnight-ntwrk/mn-passport-core';
import { clearTimer, setTimer } from './globals.js';
import { ownSignal, type OwnSignal } from './transport.js';

export interface Timing {
  readonly pollMs: number;
  readonly maxBackoffMs: number;
}

export interface Poller {
  stop(): void;
}

/**
 * The first read starts at once. `onValue` returns `false` to stop the polling. After a failure,
 * `onError` gets the error once, and the delay doubles up to `maxBackoffMs` until a read succeeds.
 */
export function startPolling<A>(
  read: (options: CallOptions) => Promise<A>,
  onValue: (value: A) => boolean,
  onError: (error: PassportError) => void,
  timing: Timing,
): Poller {
  let stopped = false;
  let failures = 0;
  let timer: unknown;
  let running: OwnSignal | undefined;

  const next = (ms: number): void => {
    // A listener can unsubscribe inside `onValue` or `onError`.
    if (stopped) return;
    clearTimer(timer);
    timer = setTimer(tick, ms);
  };

  function tick(): void {
    if (stopped) return;
    const call = ownSignal();
    running = call;
    read({ signal: call.signal }).then(
      (value) => {
        if (stopped) return;
        running = undefined;
        failures = 0;
        if (onValue(value)) next(timing.pollMs);
        else stopped = true;
      },
      (error: unknown) => {
        if (stopped) return;
        running = undefined;
        if (failures === 0) {
          // The reads give only PassportError. Any other error is also no valid answer.
          onError(error instanceof PassportError ? error : new IndexerUnreachableError('response'));
        }
        failures++;
        next(Math.min(timing.pollMs * 2 ** failures, timing.maxBackoffMs));
      },
    );
  }

  tick();
  return {
    stop() {
      stopped = true;
      clearTimer(timer);
      running?.abort();
    },
  };
}
