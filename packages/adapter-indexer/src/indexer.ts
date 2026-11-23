import {
  createStateSource,
  type ContractState,
  type HttpRequest,
  type HttpResponse,
  type Indexer,
  type Lookup,
  type TransactionStatus,
} from '@midnight-ntwrk/mn-passport-core';
import { globalWebSocket } from './globals.js';
import { sameBytes } from './merge.js';
import { startPolling, type Timing } from './poll.js';
import { createReads } from './reads.js';
import { followContractActions, type WebSocketConstructorLike } from './subscription.js';

export interface IndexerOptions {
  /** The indexer's GraphQL endpoint over HTTP. */
  readonly indexerUrl: string;
  /** The indexer's GraphQL endpoint over WebSocket. Without it, watches only poll. */
  readonly indexerWsUrl?: string;
  /**
   * The node's JSON-RPC endpoint over HTTP. Without it, state reads use the indexer only. A state
   * from the indexer has the block where it last changed. A state from the node has the node's
   * best block, and that block can still be reverted.
   */
  readonly nodeUrl?: string;
  readonly http: (request: HttpRequest) => Promise<HttpResponse>;
  /** Default: `globalThis.WebSocket`. */
  readonly webSocket?: WebSocketConstructorLike;
  /** For each indexer request, and for the whole node read. Default: 10,000. */
  readonly requestTimeoutMs?: number;
  /** Default: 2,000. */
  readonly pollMs?: number;
  /** Default: 30,000. */
  readonly maxBackoffMs?: number;
  /** The quiet time before the subscription sends a ping. Default: 10,000. */
  readonly keepAliveMs?: number;
}

// A block change alone does not emit: a state from the node has a new block at each block.
const sameState = (a: Lookup<ContractState>, b: Lookup<ContractState>): boolean =>
  a.found === b.found && (!a.found || !b.found || sameBytes(a.value.bytes, b.value.bytes));

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
export function createIndexer(options: IndexerOptions): Indexer {
  const reads = createReads(options);
  const timing: Timing = {
    pollMs: options.pollMs ?? 2_000,
    maxBackoffMs: options.maxBackoffMs ?? 30_000,
  };
  const socketTiming = { ...timing, keepAliveMs: options.keepAliveMs ?? 10_000 };
  const webSocket = options.webSocket ?? globalWebSocket();
  const wsUrl = options.indexerWsUrl;

  return {
    contractState: reads.contractState,
    transaction: reads.transaction,
    ledgerParameters: reads.ledgerParameters,
    callInputs: reads.callInputs,
    watchContract: (address) =>
      createStateSource((emit, fail) => {
        let last: Lookup<ContractState> | undefined;
        // A node failure gives the indexer's older answer, so the node's state stays until the
        // indexer reaches its block. Else a new contract would read as missing for one poll.
        let fromNode: ContractState | undefined;
        const poller = startPolling(
          (call) => reads.readState(address, call),
          (read) => {
            let state = read.state;
            // After a reorg, a node answer at or past the held block replaces it too.
            const past = (height: number | undefined) =>
              fromNode !== undefined && (height ?? -1) >= fromNode.block.height;
            if (read.fromNode) fromNode = read.state;
            else if (fromNode && !past(read.indexerHead?.height) && !past(read.nodeBlock?.height)) {
              state = fromNode;
            } else fromNode = undefined;
            const next = lookup(state);
            if (last === undefined || !sameState(last, next)) emit((last = next));
            return true;
          },
          (error) => {
            // After an outage the next value emits, also when it did not change.
            last = undefined;
            fail(error);
          },
          timing,
        );
        const unfollow =
          wsUrl === undefined || webSocket === undefined
            ? undefined
            : followContractActions(webSocket, wsUrl, address, socketTiming, {
                onAction: poller.readNow,
                // The events come from final blocks only, so a node read keeps the normal polling.
                onLive: options.nodeUrl === undefined ? poller.setSlow : () => undefined,
              });
        return () => {
          poller.stop();
          unfollow?.();
        };
      }),
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
