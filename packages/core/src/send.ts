import { PassportError } from './passport-error.js';
import type { NodeRefusedError } from './refusals.js';
import type { Broadcast } from './seams/broadcast.js';
import type {
  AbortSignalLike,
  CallOptions,
  ContractAddress,
  TransactionId,
} from './seams/common.js';
import { CancelledError, TimeoutError } from './seams/errors.js';
import type { Fees } from './seams/fees.js';
import type { Indexer } from './seams/indexer.js';
import type { PaidTransaction, ProvenTransaction, TransactionStatus } from './seams/transaction.js';

export interface SendSeams {
  readonly fees: Fees;
  readonly broadcast: Broadcast;
  readonly indexer: Indexer;
}

export interface SendLimits {
  /** Default: 4. */
  readonly sponsorRetries?: number;
  /** New payments after a node refusal, a lost transaction, or an expired proof. Default: 3. */
  readonly rebuilds?: number;
  /** The longest wait for a lost payment to land or expire. Default: 300,000. */
  readonly lostWaitMs?: number;
}

/**
 * A payment of this send can still land. Do not send the action again before
 * `final(id)` finds it, or the wait ends with no block.
 */
export class SendUncertainError extends PassportError {
  static {
    this.prototype.name = 'SendUncertainError';
  }

  readonly _tag = 'SendUncertainError' as const;
  readonly code = 'SEND_UNCERTAIN' as const;
  readonly id: TransactionId;

  constructor(id: TransactionId, cause: unknown) {
    super('A payment can still land.', { cause });
    this.id = id;
  }
}

/** The transaction is final, but its call did not run. The fee is paid. */
export class CallFailedError extends PassportError {
  static {
    this.prototype.name = 'CallFailedError';
  }

  readonly _tag = 'CallFailedError' as const;
  readonly code = 'CALL_FAILED' as const;
  readonly status: TransactionStatus;

  constructor(status: TransactionStatus) {
    super(`The transaction is final, but its call failed (${status.result ?? 'no result'}).`);
    this.status = status;
  }
}

export interface SendOptions extends CallOptions {
  /** One send at a time for each key. */
  readonly account: ContractAddress;
  /** `in-block` comes before the result: a call that fails shows only at `final`. */
  readonly until: 'in-block' | 'final';
  /** Bounds each wait on the chain. */
  readonly timeoutMs: number;
  /** Runs with the id of each payment, just before its submit. */
  readonly onSubmitted?: (id: TransactionId) => void;
}

export interface Sender {
  /**
   * Resolves at the `until` level or later. `build` runs again only for a
   * refusal that needs a new proof, or for a proof past its own ttl. After a payment, an abort or a timeout
   * rejects with `SendUncertainError`: wait with `final(error.id)`. At `final`,
   * a failed call rejects with `CallFailedError`, and so does `final`.
   */
  send(
    build: (options: CallOptions) => Promise<ProvenTransaction>,
    options: SendOptions,
  ): Promise<TransactionStatus>;
  final(
    id: TransactionId,
    options: CallOptions & { readonly timeoutMs: number },
  ): Promise<TransactionStatus>;
}

// `core` has no platform types. Every supported runtime has these timers.
const host = globalThis as typeof globalThis & {
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

const MAX_WAIT_MS = 30_000;
// A host timer fires a longer delay at once.
const MAX_TIMER_MS = 2_147_483_647;
const tagOf = (error: unknown): unknown =>
  typeof error === 'object' && error !== null && '_tag' in error ? error._tag : undefined;
const isSponsorRetry = (error: unknown): error is PassportError & { retryAfterMs?: number } =>
  (tagOf(error) === 'SponsorBusyError' || tagOf(error) === 'SponsorUnavailableError') &&
  (error as { action?: unknown }).action === 'retry';
const isNodeRefusal = (error: unknown): error is NodeRefusedError =>
  tagOf(error) === 'NodeRefusedError';
const isTimeout = (error: unknown): error is TimeoutError => tagOf(error) === 'TimeoutError';
const isExpired = (error: unknown): boolean => tagOf(error) === 'PaymentExpiredError';
const isProofExpired = (error: unknown): boolean => tagOf(error) === 'ProofExpiredError';

function succeeded(status: TransactionStatus): TransactionStatus {
  if (status.level === 'final' && status.result !== 'succeeded') throw new CallFailedError(status);
  return status;
}

function count(name: string, value: number | undefined, fallback: number, max = Infinity): number {
  const n = value ?? fallback;
  if (!Number.isInteger(n) || n < 0 || n > max) {
    const range = max === Infinity ? 'of 0 or more' : `from 0 to ${max}`;
    throw new RangeError(`${name} must be an integer ${range}.`);
  }
  return n;
}

/** Resolves after `ms`. An abort rejects it with `CancelledError`. */
function sleep(ms: number, signal: AbortSignalLike | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new CancelledError('caller'));
    const onAbort = (): void => {
      host.clearTimeout(timer);
      reject(new CancelledError('caller'));
    };
    const timer = host.setTimeout(
      () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      },
      Math.max(0, ms),
    );
    signal?.addEventListener('abort', onAbort);
  });
}

/**
 * The queue holds one send at a time for each account, but only inside this
 * sender. Two tabs, two devices, or two senders can still send at once. Only
 * the sponsor can refuse a second open payment for one account.
 */
export function createSender(seams: SendSeams, limits: SendLimits = {}): Sender {
  const { fees, broadcast, indexer } = seams;
  const sponsorRetries = count('sponsorRetries', limits.sponsorRetries, 4);
  const rebuilds = count('rebuilds', limits.rebuilds, 3);
  const lostWaitMs = count('lostWaitMs', limits.lostWaitMs, 300_000, MAX_TIMER_MS);
  const tails = new Map<ContractAddress, Promise<void>>();

  async function inQueue<A>(
    account: ContractAddress,
    signal: AbortSignalLike | undefined,
    run: (hold: (wait: Promise<unknown>) => void) => Promise<A>,
  ): Promise<A> {
    const held: Promise<unknown>[] = [];
    const before = tails.get(account) ?? Promise.resolve();
    let release = (): void => undefined;
    const tail = before.then(() => new Promise<void>((resolve) => (release = resolve)));
    tails.set(account, tail);
    try {
      await new Promise<void>((resolve, reject) => {
        const onAbort = (): void => reject(new CancelledError('caller'));
        if (signal?.aborted) return onAbort();
        signal?.addEventListener('abort', onAbort);
        void before.then(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        });
      });
      return await run((wait) => held.push(wait.catch(() => undefined)));
    } finally {
      // A send that leaves while it waits frees its place once the send before it
      // ends, and a payment that can still land keeps the place until it settles.
      void before.then(() => Promise.all(held)).then(() => release());
      void tail.then(() => {
        if (tails.get(account) === tail) tails.delete(account);
      });
    }
  }

  async function final(
    id: TransactionId,
    { timeoutMs, signal }: CallOptions & { readonly timeoutMs: number },
  ): Promise<TransactionStatus> {
    if (signal?.aborted) throw new CancelledError('caller');
    return new Promise<TransactionStatus>((resolve, reject) => {
      let stop: (() => void) | undefined;
      let settled = false;
      const finish = (settle: () => void): void => {
        settled = true;
        host.clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        stop?.();
        settle();
      };
      const onAbort = (): void => finish(() => reject(new CancelledError('caller')));
      const timer = host.setTimeout(
        () => finish(() => reject(new TimeoutError(timeoutMs))),
        timeoutMs,
      );
      signal?.addEventListener('abort', onAbort);
      // A watch error is not the end: the indexer adapter goes on and emits again.
      let unsubscribe: () => void;
      try {
        unsubscribe = indexer.watchTransaction(id).subscribe((lookup) => {
          if (lookup.found && lookup.value.level === 'final') {
            const status = lookup.value;
            finish(() =>
              status.result === 'succeeded' ? resolve(status) : reject(new CallFailedError(status)),
            );
          }
        });
      } catch (error) {
        return finish(() => reject(error));
      }
      // The listener can run inside `subscribe`, before `stop` exists.
      if (settled) unsubscribe();
      else stop = unsubscribe;
    });
  }

  return {
    final,
    send(build, { account, until, timeoutMs, signal, onSubmitted }) {
      if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > MAX_TIMER_MS) {
        return Promise.reject(
          new RangeError(`timeoutMs must be an integer from 0 to ${MAX_TIMER_MS}.`),
        );
      }
      const options: CallOptions = signal ? { signal } : {};

      async function pay(proven: ProvenTransaction): Promise<PaidTransaction> {
        for (let retry = 0; ; retry++) {
          try {
            return await fees.pay(proven, options);
          } catch (error) {
            if (!isSponsorRetry(error) || retry >= sponsorRetries) throw error;
            await sleep(Math.min(error.retryAfterMs ?? 1_000 * 2 ** retry, MAX_WAIT_MS), signal);
          }
        }
      }

      // The held wait reads the indexer only, because a submit could send the bytes.
      const uncertain = (
        id: TransactionId,
        cause: unknown,
        hold: (wait: Promise<unknown>) => void,
      ): SendUncertainError => {
        hold(final(id, { timeoutMs: lostWaitMs }));
        return new SendUncertainError(id, cause);
      };

      // Waits on a lost payment until the adapter finds it or says that it expired.
      const settle = async (tx: PaidTransaction, hold: (wait: Promise<unknown>) => void) => {
        const wait = (ms: number) =>
          broadcast.submit(tx, { ...options, until: 'in-block', timeoutMs: ms });
        try {
          return await wait(timeoutMs).catch((error: unknown) => {
            if (!isTimeout(error)) throw error;
            return wait(lostWaitMs);
          });
        } catch (error) {
          // Only a refusal or an expiry says that the payment cannot land.
          if (isNodeRefusal(error) || isExpired(error)) throw error;
          throw uncertain(tx.id, error, hold);
        }
      };

      return inQueue(account, signal, async (hold) => {
        let proven = await build(options);
        for (let attempt = 0; ; attempt++) {
          let tx: PaidTransaction;
          try {
            tx = await pay(proven);
          } catch (error) {
            if (!isProofExpired(error) || attempt >= rebuilds) throw error;
            proven = await build(options);
            continue;
          }
          onSubmitted?.(tx.id);
          let status: TransactionStatus;
          try {
            status = await settle(tx, hold);
          } catch (error) {
            // The payment cannot land, so a new payment of the same proof is safe.
            if (isExpired(error) && attempt < rebuilds) continue;
            if (!isNodeRefusal(error) || error.action === 'stop' || attempt >= rebuilds)
              throw error;
            if (error.newProof) proven = await build(options);
            continue;
          }
          if (until === 'in-block' || status.level === 'final') return succeeded(status);
          // The status can name another payment of the same proof: the one that landed.
          const done = await broadcast
            .submit(tx, { ...options, until: 'final', timeoutMs })
            .catch((error: unknown) => {
              throw uncertain(status.id, error, hold);
            });
          return succeeded(done);
        }
      });
    },
  };
}
