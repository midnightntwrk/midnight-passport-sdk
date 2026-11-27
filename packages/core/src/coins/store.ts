import { fromHex, toHex } from '../hex.js';
import { checkCoin, type CoinDescription } from '../inbox/entry.js';
import { ascii } from '../keys/challenge.js';
import { PassportError } from '../passport-error.js';
import type { ContractAddress } from '../seams/common.js';
import type { LocalStore } from '../seams/platform.js';

/** A candidate is the depositor's claim only. A coin is `held` after the chain check. */
export type CoinState = 'candidate' | 'held' | 'spent';

export interface StoredCoin extends CoinDescription {
  readonly state: CoinState;
  /** The commitment-tree position. Always set for `held`. */
  readonly mtIndex: bigint | undefined;
  readonly inboxIndex: bigint | undefined;
}

export interface HeldCoin extends CoinDescription {
  readonly mtIndex: bigint;
}

export interface InboxCandidate extends CoinDescription {
  readonly inboxIndex: bigint;
}

/** Keeps the coins of one account. It is a cache: the chain can rebuild it. */
export interface CoinStore {
  /** A coin that the store knows keeps its state, so a spent coin stays spent. */
  offer(candidate: InboxCandidate): void;
  /** Call only after the chain check. A spent coin stays spent. */
  hold(coin: CoinDescription, mtIndex: bigint): void;
  markSpent(coin: CoinDescription): void;
  /** The smallest held coin of `color` worth at least `amount`. */
  select(color: Uint8Array, amount: bigint): HeldCoin | undefined;
  /** Counts held coins only. */
  total(color: Uint8Array): bigint;
  coins(): readonly StoredCoin[];
  /** Holds coin descriptions and no key. */
  serialize(): Uint8Array;
}

export class CoinStoreFormatError extends PassportError {
  readonly _tag = 'CoinStoreFormatError';
  readonly code = 'COIN_STORE_FORMAT';
  readonly reason: 'version' | 'malformed';

  constructor(reason: 'version' | 'malformed') {
    super(
      reason === 'version'
        ? 'The saved coin store has an unknown format version.'
        : 'The saved coin store is damaged.',
    );
    this.name = 'CoinStoreFormatError';
    this.reason = reason;
  }
}

const FORMAT = 1;
const U64 = 1n << 64n;
const U128 = 1n << 128n;

/** The tree position is not part of it, so a corrected position updates the same coin. */
export const coinId = (coin: CoinDescription): string =>
  `${toHex(coin.nonce)}:${toHex(coin.color)}:${String(coin.value)}`;

const checkIndex = (index: bigint): void => {
  if (index < 0n || index >= U64) throw new RangeError('An index must fit in 64 bits.');
};

const copy = (coin: StoredCoin): StoredCoin => ({
  ...coin,
  nonce: coin.nonce.slice(),
  color: coin.color.slice(),
});

/** A damaged or unknown `saved` throws `CoinStoreFormatError`. */
export function createCoinStore(saved?: Uint8Array): CoinStore {
  const coins = new Map<string, StoredCoin>();
  if (saved !== undefined) for (const coin of parse(saved)) coins.set(coinId(coin), coin);
  const put = (coin: CoinDescription, next: Omit<StoredCoin, keyof CoinDescription>) => {
    coins.set(coinId(coin), {
      nonce: coin.nonce.slice(),
      color: coin.color.slice(),
      value: coin.value,
      ...next,
    });
  };
  const live = (color: Uint8Array): HeldCoin[] => {
    const wanted = toHex(color);
    const out: HeldCoin[] = [];
    for (const coin of coins.values()) {
      const { state, mtIndex } = coin;
      if (state === 'held' && mtIndex !== undefined && toHex(coin.color) === wanted) {
        out.push({ ...coin, mtIndex });
      }
    }
    return out;
  };
  return {
    offer(candidate) {
      checkCoin(candidate);
      checkIndex(candidate.inboxIndex);
      if (coins.has(coinId(candidate))) return;
      put(candidate, { state: 'candidate', mtIndex: undefined, inboxIndex: candidate.inboxIndex });
    },
    hold(coin, mtIndex) {
      checkCoin(coin);
      checkIndex(mtIndex);
      const known = coins.get(coinId(coin));
      if (known?.state === 'spent') return;
      put(coin, { state: 'held', mtIndex, inboxIndex: known?.inboxIndex });
    },
    markSpent(coin) {
      checkCoin(coin);
      const known = coins.get(coinId(coin));
      put(coin, { state: 'spent', mtIndex: known?.mtIndex, inboxIndex: known?.inboxIndex });
    },
    select(color, amount) {
      let best: HeldCoin | undefined;
      for (const coin of live(color)) {
        if (coin.value >= amount && (best === undefined || coin.value < best.value)) best = coin;
      }
      if (best === undefined) return undefined;
      const { nonce, color: c, value, mtIndex } = best;
      return { nonce: nonce.slice(), color: c.slice(), value, mtIndex };
    },
    total: (color) => live(color).reduce((sum, coin) => sum + coin.value, 0n),
    coins: () => [...coins.values()].map(copy),
    serialize() {
      const rows = [...coins.values()].map((coin) => ({
        nonce: toHex(coin.nonce),
        color: toHex(coin.color),
        value: String(coin.value),
        state: coin.state,
        ...(coin.mtIndex === undefined ? {} : { mtIndex: String(coin.mtIndex) }),
        ...(coin.inboxIndex === undefined ? {} : { inboxIndex: String(coin.inboxIndex) }),
      }));
      // Every field is hex, decimal, or a fixed word, so the format is ASCII.
      return ascii(JSON.stringify({ version: FORMAT, coins: rows }));
    },
  };
}

const HEX32 = /^[0-9a-f]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const isState = (text: string): text is CoinState =>
  text === 'candidate' || text === 'held' || text === 'spent';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parse(bytes: Uint8Array): StoredCoin[] {
  let text = '';
  for (const byte of bytes) {
    if (byte > 0x7f) throw new CoinStoreFormatError('malformed');
    text += String.fromCharCode(byte);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new CoinStoreFormatError('malformed');
  }
  if (!isRecord(value) || typeof value.version !== 'number') {
    throw new CoinStoreFormatError('malformed');
  }
  if (value.version !== FORMAT) throw new CoinStoreFormatError('version');
  if (!Array.isArray(value.coins)) throw new CoinStoreFormatError('malformed');
  const seen = new Set<string>();
  return value.coins.map((row: unknown): StoredCoin => {
    const coin = parseRow(row);
    if (seen.has(coinId(coin))) throw new CoinStoreFormatError('malformed');
    seen.add(coinId(coin));
    return coin;
  });
}

function parseRow(row: unknown): StoredCoin {
  const bad = () => new CoinStoreFormatError('malformed');
  if (!isRecord(row)) throw bad();
  const { nonce, color, value, state, mtIndex, inboxIndex } = row;
  const integer = (text: unknown, limit: bigint): bigint | undefined => {
    if (text === undefined) return undefined;
    if (typeof text !== 'string' || !DECIMAL.test(text) || BigInt(text) >= limit) throw bad();
    return BigInt(text);
  };
  // Lowercase only, so one coin has one id.
  const word = (text: unknown): Uint8Array => {
    const bytes = typeof text === 'string' && HEX32.test(text) ? fromHex(text) : undefined;
    if (bytes === undefined) throw bad();
    return bytes;
  };
  if (typeof state !== 'string' || !isState(state)) throw bad();
  const amount = integer(value, U128);
  const position = integer(mtIndex, U64);
  const entryIndex = integer(inboxIndex, U64);
  if (amount === undefined) throw bad();
  if (state === 'held' && position === undefined) throw bad();
  if (state === 'candidate' && entryIndex === undefined) throw bad();
  return {
    nonce: word(nonce),
    color: word(color),
    value: amount,
    state,
    mtIndex: position,
    inboxIndex: entryIndex,
  };
}

export interface CoinStoreScope {
  /** Lowercase letters, digits, and `-`, for example `preview`. One address can exist on two networks, so the key holds both. */
  readonly network: string;
  readonly address: ContractAddress;
}

function keyOf(scope: CoinStoreScope): string {
  if (!/^[0-9a-f]+$/.test(scope.address))
    throw new RangeError('The address must be lowercase hex.');
  if (!/^[a-z0-9-]+$/.test(scope.network)) {
    throw new RangeError('The network name has a character other than a-z, 0-9, or -.');
  }
  const key = `coins:${scope.network}:${scope.address}`;
  if (key.length > 120) {
    throw new RangeError('The network name makes the store key longer than 120 bytes.');
  }
  return key;
}

/** An empty store when none is saved. A damaged one throws `CoinStoreFormatError`. */
export async function loadCoinStore(local: LocalStore, scope: CoinStoreScope): Promise<CoinStore> {
  return createCoinStore(await local.get(keyOf(scope)));
}

/** One writer per scope: two writers can lose a `spent` mark. */
export async function saveCoinStore(
  local: LocalStore,
  scope: CoinStoreScope,
  store: CoinStore,
): Promise<void> {
  await local.set(keyOf(scope), store.serialize());
}
