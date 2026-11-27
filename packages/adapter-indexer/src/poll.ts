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
  /** Reads at once. During a read, it reads once more after it. During an outage, it does nothing. */
  readNow(): void;
  /** While `slow`, the polling interval is `maxBackoffMs`. */
  setSlow(slow: boolean): void;
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
  let again = false;
  let slow = false;
  const interval = (): number => (slow ? timing.maxBackoffMs : timing.pollMs);

  const next = (ms: number): void => {
    // A listener can unsubscribe inside `onValue` or `onError`.
    if (stopped) return;
    clearTimer(timer);
    timer = setTimer(tick, again ? 0 : ms);
    again = false;
  };

  function tick(): void {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    const call = ownSignal();
    running = call;
    read({ signal: call.signal }).then(
      (value) => {
        if (stopped) return;
        running = undefined;
        failures = 0;
        if (onValue(value)) next(interval());
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
        // An event must not make a read go out before the backoff ends.
        again = false;
        next(Math.min(timing.pollMs * 2 ** failures, timing.maxBackoffMs));
      },
    );
  }

  tick();
  return {
    readNow() {
      if (stopped || failures > 0) return;
      if (running) again = true;
      else next(0);
    },
    setSlow(value) {
      slow = value;
      if (!slow && !stopped && !running && failures === 0) next(timing.pollMs);
    },
    stop() {
      stopped = true;
      clearTimer(timer);
      running?.abort();
    },
  };
}
