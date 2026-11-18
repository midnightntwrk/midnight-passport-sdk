import {
  createStateSource,
  type HttpRequest,
  type HttpResponse,
  type Indexer,
  type Lookup,
  type TransactionStatus,
} from '@midnight-ntwrk/mn-passport-core';
import { startPolling, type Timing } from './poll.js';
import { createReads } from './reads.js';

export interface IndexerOptions {
  /** The indexer's GraphQL endpoint over HTTP. */
  readonly indexerUrl: string;
  /**
   * The node's JSON-RPC endpoint over HTTP. Without it, state reads use the indexer only. A state
   * from the indexer has the block where it last changed. A state from the node has the node's
   * best block, and that block can still be reverted.
   */
  readonly nodeUrl?: string;
  readonly http: (request: HttpRequest) => Promise<HttpResponse>;
  /** For each indexer request, and for the whole node read. Default: 10,000. */
  readonly requestTimeoutMs?: number;
  /** Default: 2,000. */
  readonly pollMs?: number;
  /** Default: 30,000. */
  readonly maxBackoffMs?: number;
}

const sameStatus = (a: Lookup<TransactionStatus>, b: Lookup<TransactionStatus>): boolean =>
  a.found === b.found &&
  (!a.found ||
    !b.found ||
    (a.value.level === b.value.level &&
      a.value.result === b.value.result &&
      a.value.block.hash === b.value.block.hash));

const lookup = <A>(value: A | undefined): Lookup<A> =>
  value === undefined ? { found: false } : { found: true, value };

/**
 * Watches report each indexer outage once with `IndexerUnreachableError`, back off, and emit
 * again when the indexer is back.
 */
export function createIndexer(options: IndexerOptions): Omit<Indexer, 'watchContract'> {
  const reads = createReads(options);
  const timing: Timing = {
    pollMs: options.pollMs ?? 2_000,
    maxBackoffMs: options.maxBackoffMs ?? 30_000,
  };

  return {
    contractState: reads.contractState,
    transaction: reads.transaction,
    watchTransaction: (id) =>
      createStateSource((emit, fail) => {
        let last: Lookup<TransactionStatus> | undefined;
        const poller = startPolling(
          (call) => reads.transaction(id, call),
          (status) => {
            const next = lookup(status);
            if (last === undefined || !sameStatus(last, next)) emit((last = next));
            return status?.level !== 'final';
          },
          (error) => {
            // After an outage the next value emits, also when it did not change.
            last = undefined;
            fail(error);
          },
          timing,
        );
        return poller.stop;
      }),
  };
}
