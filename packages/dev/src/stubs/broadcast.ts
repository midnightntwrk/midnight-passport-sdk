import {
  CancelledError,
  TimeoutError,
  type Broadcast,
  type TransactionStatus,
} from '@midnight-ntwrk/mn-passport-core';
import { throwIfAborted } from '../abort.js';
import type { StubChain } from './chain.js';

export function createStubBroadcast(chain: StubChain): Broadcast {
  return {
    async submit(tx, { until, timeoutMs, signal }) {
      throwIfAborted(signal);
      chain.receive(tx);
      return new Promise<TransactionStatus>((resolve, reject) => {
        const finish = (settle: () => void): void => {
          clearTimeout(timer);
          stop();
          signal?.removeEventListener('abort', onAbort);
          settle();
        };
        const check = (): void => {
          const status = chain.status(tx.id);
          if (status && (until === 'in-block' || status.level === 'final')) {
            finish(() => resolve(status));
          }
        };
        const onAbort = (): void => finish(() => reject(new CancelledError('caller')));
        const timer = setTimeout(
          () => finish(() => reject(new TimeoutError(timeoutMs))),
          timeoutMs,
        );
        const stop = chain.onChange(check);
        signal?.addEventListener('abort', onAbort);
        check();
      });
    },
  };
}
