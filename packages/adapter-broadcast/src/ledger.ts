import {
  CancelledError,
  UpstreamError,
  type AbortSignalLike,
  type Platform,
} from '@midnight-ntwrk/mn-passport-core';
import { clearTimer, setTimer } from './host.js';

export type Ledger = typeof import('@midnightntwrk/ledger-v9');

/**
 * Loads the WASM runtimes and ledger-v9. A failure or no load within
 * `timeoutMs` is an `UpstreamError` with no upstream text; an abort ends the wait.
 */
export function loadLedger(
  platform: Platform,
  signal: AbortSignalLike | undefined,
  timeoutMs: number,
): Promise<Ledger> {
  const fail = (sourceTag: string) => () => {
    throw new UpstreamError({ sourceTag });
  };
  const load = platform
    .loadRuntimes()
    .then(() => import('@midnightntwrk/ledger-v9').catch(fail('ledger-v9')), fail('loadRuntimes'));
  return new Promise<Ledger>((resolve, reject) => {
    if (signal?.aborted) return reject(new CancelledError('caller'));
    const onAbort = (): void => reject(new CancelledError('caller'));
    const timer = setTimer(
      () => reject(new UpstreamError({ sourceTag: 'loadRuntimes' })),
      timeoutMs,
    );
    signal?.addEventListener('abort', onAbort);
    load.then(resolve, reject).finally(() => {
      clearTimer(timer);
      signal?.removeEventListener('abort', onAbort);
    });
  });
}

/** Epoch milliseconds of the earliest intent ttl: after it, no ledger takes the bytes. */
export function earliestTtl(
  intents: ReadonlyMap<number, { readonly ttl: Date }> | undefined,
): number | undefined {
  const times = [...(intents?.values() ?? [])].map((intent) => intent.ttl.getTime());
  return times.length > 0 ? Math.min(...times) : undefined;
}
