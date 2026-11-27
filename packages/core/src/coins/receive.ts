import type { EventDetails } from '@midnightntwrk/ledger-v9';
import { toHex } from '../hex.js';
import type { InboxKey } from '../inbox/entry.js';
import { readAccountLedger, type AccountLedgerOf } from '../inbox/ledger.js';
import { walkInbox } from '../inbox/walk.js';
import type { BlockRef, CallOptions, ContractAddress } from '../seams/common.js';
import type { Indexer } from '../seams/indexer.js';
import type { CoinStore } from './store.js';

type OutputEvent = Extract<EventDetails, { tag: 'zswapOutput' }>;
// The catch-all `{ tag: string }` arm of the union stops plain narrowing.
const isOutput = (content: EventDetails): content is OutputEvent => content.tag === 'zswapOutput';

export interface ReceiveInput {
  readonly address: ContractAddress;
  /** The block of the state that `watchContract` emitted. It can be a best block of the node. */
  readonly seen: BlockRef;
  /** The `ledger` function of the account's ACC module. */
  readonly ledger: AccountLedgerOf;
  readonly indexer: Pick<Indexer, 'callInputs' | 'zswapEvents'>;
  readonly key: InboxKey;
  readonly store: CoinStore;
  /** The last bigint that a receive gave, or `0n`. */
  readonly from: bigint;
  readonly options?: CallOptions;
}

/**
 * Holds a new entry's coin only when the block where the indexer's state changed created it.
 * Resolves with the next `from`, which stays at the first entry that is still a candidate.
 * `undefined` while the indexer is behind `seen`: retry faster than one block, and stop when the
 * watch emits again. A throw can leave entries offered; a retry is safe.
 */
export async function receiveCoins(input: ReceiveInput): Promise<bigint | undefined> {
  const { address, store } = input;
  // Only the indexer's state has the block where it changed, and its blocks are final.
  const read = await input.indexer.callInputs(address, input.options);
  if (read === undefined || read.block.height < input.seen.height) return undefined;
  const { state } = read;
  const account = await readAccountLedger(state.bytes, input.ledger);
  const { candidates, next } = await walkInbox(account, input.key, input.from);
  if (candidates.length === 0) return next;
  const events = await input.indexer.zswapEvents(state.block, input.options);
  if (events === undefined) return undefined;
  const { Event, ZswapOutput } = await import('@midnightntwrk/ledger-v9');
  const created = new Map<string, bigint>();
  for (const raw of events) {
    let content: EventDetails;
    try {
      content = Event.deserialize(raw).content;
    } catch {
      // An event that does not decode cannot hold a coin, so skip it.
      continue;
    }
    // The commitment binds the recipient, so no output to another owner can match.
    if (isOutput(content)) created.set(content.commitment, content.mtIndex);
  }
  for (const candidate of candidates) {
    store.offer(candidate);
    const coin = {
      type: toHex(candidate.color),
      nonce: toHex(candidate.nonce),
      value: candidate.value,
    };
    const mtIndex = created.get(ZswapOutput.newContractOwned(coin, undefined, address).commitment);
    if (mtIndex !== undefined) store.hold(candidate, mtIndex);
  }
  let until = next;
  for (const { state, inboxIndex } of store.coins()) {
    const open = state === 'candidate' && inboxIndex !== undefined && inboxIndex >= input.from;
    if (open && inboxIndex < until) until = inboxIndex;
  }
  return until;
}
