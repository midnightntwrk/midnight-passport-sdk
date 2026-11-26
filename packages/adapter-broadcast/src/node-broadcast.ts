import {
  CancelledError,
  PaymentExpiredError,
  TimeoutError,
  type AbortSignalLike,
  type BlockRef,
  type Broadcast,
  type Indexer,
  type NodeRefusedError,
  type PaidTransaction,
  type PassportError,
  type Platform,
  type TransactionId,
  type TransactionStatus,
} from '@midnight-ntwrk/mn-passport-core';
import { checkCallIndex, extrinsicHex, type CallIndex } from './extrinsic.js';
import { checkMs, checkUrl, clearTimer, newAbortController, setTimer } from './host.js';
import { earliestTtl, loadLedger } from './ledger.js';
import { createNodeClient, submitOnce, type NodeClient } from './node.js';
import { field } from './request.js';

export interface NodeBroadcastOptions {
  /** The node's JSON-RPC endpoint over HTTP. `https:`, or `http:` on a loopback host. */
  readonly url: string;
  readonly platform: Platform;
  /** Gives the `final` level and its result. */
  readonly indexer: Indexer;
  /** The call index of `send_mn_transaction`. Default: `[0x05, 0x00]`, from midnight-node 2.1.101. */
  readonly callIndex?: CallIndex;
  /** Default: 1,000. */
  readonly pollMs?: number;
  /** Default: 10,000. */
  readonly requestTimeoutMs?: number;
  /**
   * How long past the earliest intent ttl a payment can still show in a block.
   * It also covers a client clock that runs fast. Default: 150,000.
   */
  readonly expiryMarginMs?: number;
}

const DEFAULT_CALL_INDEX: CallIndex = [0x05, 0x00];
const KEPT_PAYMENTS = 64;
// A refused send is looked for this far below its start, because a block can
// already hold it from an earlier send.
const REFUSAL_LOOKBACK = 64;
const HASH = /^0x[0-9a-fA-F]{64}$/;

/**
 * "In a block" comes from the node, and "final" from `indexer`. The status at
 * `in-block` can still be undone by a reorg. The status can name another
 * payment of the same proof: the one that landed. A bad option throws
 * `TypeError` or `RangeError`.
 */
export function nodeBroadcast(options: NodeBroadcastOptions): Broadcast {
  const url = checkUrl('url', options.url);
  const callIndex = checkCallIndex(options.callIndex ?? DEFAULT_CALL_INDEX);
  const pollMs = checkMs('pollMs', options.pollMs ?? 1_000);
  const node = createNodeClient(
    options.platform,
    url,
    checkMs('requestTimeoutMs', options.requestTimeoutMs ?? 10_000),
  );
  const { indexer, platform } = options;
  const expiryMarginMs = checkMs('expiryMarginMs', options.expiryMarginMs ?? 150_000);
  const loadTimeoutMs = checkMs('requestTimeoutMs', options.requestTimeoutMs ?? 10_000);
  // Keyed by extrinsic, because two payments of one proof can share an id.
  const kept = new Map<string, Kept>();
  const keep = (hex: string, entry: Kept): void => {
    kept.delete(hex);
    kept.set(hex, entry);
    const oldest = kept.keys().next();
    if (kept.size > KEPT_PAYMENTS && !oldest.done) kept.delete(oldest.value);
  };

  return {
    async submit(tx, { until, timeoutMs, signal }) {
      checkMs('timeoutMs', timeoutMs);
      if (signal?.aborted) throw new CancelledError('caller');
      const hex = extrinsicHex(tx.bytes, callIndex);
      const earlier = kept.get(hex);
      const due = (): boolean => tx.submitBy !== undefined && Date.now() >= tx.submitBy;
      if (!earlier && due()) throw new PaymentExpiredError(false);
      const call = openCall(signal, timeoutMs);
      let stopWatch = (): void => undefined;
      try {
        const facts = await call.guard(readFacts(platform, tx, call.signal, loadTimeoutMs));
        const scan = createScan(node, hex, call.signal);
        let final: TransactionStatus | undefined;
        // A kept refusal goes on to the next call, so its walk looks below the start too.
        if (earlier)
          scan.from(
            earlier.refusal ? Math.max(0, earlier.start - REFUSAL_LOOKBACK) : earlier.start,
          );
        let start = earlier?.start;
        let attempted = earlier !== undefined;
        let sent = earlier?.sent ?? false;
        let block = earlier?.block;
        let landed = earlier?.landed ?? tx.id;
        let refusal = earlier?.refusal;
        let watched: TransactionId | undefined;
        // Only a wait for `final` watches the indexer, so `in-block` keeps its level.
        // The watch follows `landed`, because another payment of the same proof can land.
        const watch = (): void => {
          if (until !== 'final' || watched === landed) return;
          stopWatch();
          watched = landed;
          stopWatch = indexer.watchTransaction(landed).subscribe((lookup) => {
            if (lookup.found && lookup.value.level === 'final') {
              final = lookup.value;
              call.wake();
            }
          });
        };
        watch();
        const remember = (): void => {
          if (start !== undefined)
            keep(hex, {
              start,
              sent: sent || attempted,
              landed,
              ...(block ? { block } : {}),
              ...(refusal ? { refusal } : {}),
            });
        };

        // A payment that reached no node can be sent until `submitBy`, and never after.
        const send = async (): Promise<void> => {
          start ??= await bestHeight(node, call.signal);
          // The clock is read with no wait before the send, so no send starts late.
          if (due()) {
            if (!attempted) throw new PaymentExpiredError(false);
            sent = true;
            return;
          }
          if (start === undefined) return;
          scan.from(start);
          // Kept before the send: the node can hold the bytes even when the call ends first.
          attempted = true;
          remember();
          const outcome = await submitOnce(node, tx, callIndex, call.signal);
          if (outcome.kind === 'failed') return;
          sent = true;
          if (outcome.kind === 'refused') {
            refusal = outcome.error;
            scan.from(Math.max(0, start - REFUSAL_LOOKBACK));
          }
        };

        // Any identifier of the bytes counts, so another payment of the same proof
        // is found too. Only a full walk and an indexer answer can say "absent".
        const onChain = async (): Promise<'found' | 'absent' | 'unknown'> => {
          const found = await scan.find();
          if (found === 'failed') return 'unknown';
          if (found !== 'absent') {
            block = found;
            return 'found';
          }
          for (const id of facts.ids) {
            let status: TransactionStatus | undefined;
            try {
              status = await indexer.transaction(id, { signal: call.signal });
            } catch {
              if (call.signal.aborted) throw new CancelledError('caller');
              return 'unknown';
            }
            if (!status) continue;
            landed = status.id;
            watch();
            if (status.level === 'final' && until === 'final') final = status;
            else block = status.block;
            return 'found';
          }
          return 'absent';
        };

        const expired = (): boolean =>
          facts.expiresAt !== undefined && Date.now() >= facts.expiresAt + expiryMarginMs;

        for (;;) {
          if (final) return final;
          if (block && until === 'in-block') return inBlock(landed, block);
          if (refusal || (attempted && !block && expired())) {
            const verdict = await call.guard(onChain());
            if (verdict === 'absent') {
              kept.delete(hex);
              throw refusal ?? new PaymentExpiredError(true);
            }
            if (verdict === 'found') refusal = undefined;
          } else if (!sent) {
            await call.guard(send());
          } else if (!block) {
            const found = await call.guard(scan.find());
            if (typeof found === 'object') block = found;
          }
          remember();
          if (final || (block && until === 'in-block')) continue;
          await call.sleep(pollMs);
        }
      } finally {
        stopWatch();
        call.close();
      }
    },
  };
}

interface Kept {
  readonly start: number;
  /** A send was made, or may have reached the node. */
  readonly sent: boolean;
  /** The id of the payment that a block holds: this one, or another of the same proof. */
  readonly landed: TransactionId;
  readonly block?: BlockRef;
  /** No block or indexer read has shown the bytes since the node refused them. */
  readonly refusal?: NodeRefusedError;
}

// Bytes that do not parse, such as stub bytes, give no expiry: they are never
// called expired after a send.
async function readFacts(
  platform: Platform,
  tx: PaidTransaction,
  signal: AbortSignalLike,
  timeoutMs: number,
): Promise<{ readonly ids: readonly TransactionId[]; readonly expiresAt: number | undefined }> {
  try {
    const ledger = await loadLedger(platform, signal, timeoutMs);
    const paid = ledger.Transaction.deserialize('signature', 'proof', 'binding', tx.bytes);
    return {
      ids: [tx.id, ...paid.identifiers().filter((id) => id !== tx.id)],
      expiresAt: earliestTtl(paid.intents),
    };
  } catch {
    if (signal.aborted) throw new CancelledError('caller');
    return { ids: [tx.id], expiresAt: undefined };
  }
}

const inBlock = (id: TransactionId, block: BlockRef): TransactionStatus => ({
  id,
  level: 'in-block',
  block,
  result: undefined,
});

function openCall(signal: AbortSignalLike | undefined, timeoutMs: number) {
  const controller = newAbortController();
  let rejectEnded: (error: PassportError) => void = () => undefined;
  const ended = new Promise<never>((_, reject) => (rejectEnded = reject));
  ended.catch(() => undefined);
  // A second end changes nothing: a settled promise and an aborted signal stay as they are.
  const end = (error: PassportError): void => {
    rejectEnded(error);
    controller.abort();
  };
  const onAbort = (): void => end(new CancelledError('caller'));
  signal?.addEventListener('abort', onAbort);
  const timer = setTimer(() => end(new TimeoutError(timeoutMs)), timeoutMs);
  let wake = (): void => undefined;
  // `ended` rejects before the abort reaches the work, so the end's error wins.
  const guard = <A>(work: Promise<A>): Promise<A> => Promise.race([work, ended]);
  return {
    signal: controller.signal,
    guard,
    sleep: (ms: number) =>
      guard(
        new Promise<void>((resolve) => {
          const handle = setTimer(resolve, ms);
          wake = () => {
            clearTimer(handle);
            resolve();
          };
        }),
      ),
    /** Ends the current sleep early. */
    wake: () => wake(),
    close() {
      wake();
      clearTimer(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

async function bestHeight(node: NodeClient, signal: AbortSignalLike): Promise<number | undefined> {
  const answer = await node.call('chain_getHeader', [], signal);
  return answer.kind === 'result' ? height(answer.result) : undefined;
}

const height = (header: unknown): number | undefined => {
  const number = field(header, 'number');
  if (typeof number !== 'string' || !/^0x[0-9a-fA-F]{1,13}$/.test(number)) return undefined;
  return Number.parseInt(number, 16);
};

interface Scan {
  /** Lowers the height where the walk stops. */
  from(height: number): void;
  /** `absent` only after a whole walk to the floor; `failed` when a read fails. */
  find(): Promise<BlockRef | 'absent' | 'failed'>;
}

// Walks parent hashes from the best block, so a block that replaced one it read
// is read too. A block is marked as read only after a whole walk succeeds.
function createScan(node: NodeClient, hex: string, signal: AbortSignalLike): Scan {
  const read = new Set<string>();
  let lowest = Number.POSITIVE_INFINITY;
  return {
    from(height) {
      if (height < lowest) {
        lowest = height;
        read.clear();
      }
    },
    async find() {
      const head = await node.call('chain_getBlockHash', [], signal);
      let hash = head.kind === 'result' ? head.result : undefined;
      const walked = new Set<string>();
      while (!(typeof hash === 'string' && read.has(hash))) {
        // A bad hash or a cycle is a failed read, so the walk never spins.
        if (typeof hash !== 'string' || !HASH.test(hash) || walked.has(hash)) return 'failed';
        const answer = await node.call('chain_getBlock', [hash], signal);
        const block = answer.kind === 'result' ? field(answer.result, 'block') : undefined;
        const header = field(block, 'header');
        const number = height(header);
        const extrinsics = field(block, 'extrinsics');
        if (number === undefined || !Array.isArray(extrinsics)) return 'failed';
        if (number < lowest) break;
        if (extrinsics.includes(hex)) return { height: number, hash: hash.slice(2).toLowerCase() };
        walked.add(hash);
        if (number === lowest) break;
        hash = field(header, 'parentHash');
      }
      for (const done of walked) read.add(done);
      return 'absent';
    },
  };
}
