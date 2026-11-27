import { coinId, type InboxCandidate } from '../coins/store.js';
import { openInboxEntry, type InboxKey } from './entry.js';

/** The inbox fields of the compiled account `Ledger`. */
export interface InboxLedger {
  readonly inbox_count: bigint;
  readonly inbox: {
    member(index: bigint): boolean;
    lookup(index: bigint): Uint8Array;
  };
}

export interface InboxWalk {
  /** Claims only: no commitment is checked. A coin found twice keeps its first index. */
  readonly candidates: readonly InboxCandidate[];
  /** Pass it as `from` to open only the entries after this walk. */
  readonly next: bigint;
}

/** An `InboxKeyError` gives no partial result. Walk again from the same `from`. */
export async function walkInbox(ledger: InboxLedger, key: InboxKey, from = 0n): Promise<InboxWalk> {
  if (from < 0n) throw new RangeError('`from` cannot be negative.');
  const candidates: InboxCandidate[] = [];
  const seen = new Set<string>();
  for (let index = from; index < ledger.inbox_count; index++) {
    if (!ledger.inbox.member(index)) continue;
    const coin = await openInboxEntry(ledger.inbox.lookup(index), key);
    if (coin === undefined || seen.has(coinId(coin))) continue;
    seen.add(coinId(coin));
    candidates.push({ ...coin, inboxIndex: index });
  }
  // A smaller count than `from` means the chain went back. Walk again from the count.
  return { candidates, next: ledger.inbox_count };
}
