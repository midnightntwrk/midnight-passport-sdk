import {
  IndexerUnreachableError,
  createStateSource,
  type AbortSignalLike,
  type BlockRef,
  type Indexer,
  type Lookup,
} from '@midnight-ntwrk/mn-passport-core';
import { createHold } from '../abort.js';
import type { StubChain } from './chain.js';

export interface StubIndexerOptions {
  /** Each read rejects, and each watch fails, as if no source answered. */
  readonly unreachable?: boolean;
  /** Default: one zero byte. */
  readonly ledgerParameters?: Uint8Array;
  /** The same bytes for every contract. Default: one zero byte. */
  readonly zswapChainState?: Uint8Array;
}

// The stub's parameters never change, so they hold from the first block.
const GENESIS = { height: 0, hash: '00'.repeat(32) };

export type StubIndexer = Indexer & {
  /** The next read stays in flight until its signal aborts. */
  holdNext(): void;
  /** Each of the next `count` reads rejects with `IndexerUnreachableError`. */
  failReads(count: number): void;
  /** `zswapEvents` reads `undefined` for a block with no events set. */
  setZswapEvents(block: BlockRef, events: readonly Uint8Array[]): void;
};

/** A watch emits only when its value changes. */
export function createStubIndexer(chain: StubChain, options: StubIndexerOptions = {}): StubIndexer {
  const down = () => new IndexerUnreachableError('network');
  const hold = createHold();
  let failing = 0;
  const read = <A>(signal: AbortSignalLike | undefined, value: () => A) =>
    hold.run(signal, () => {
      if (options.unreachable) throw down();
      if (failing > 0) {
        failing--;
        throw down();
      }
      return value();
    });
  const watch = <A>(value: () => A | undefined) =>
    createStateSource<Lookup<A>>((emit, fail) => {
      if (options.unreachable) {
        fail(down());
        return () => {};
      }
      let last: { readonly value: A | undefined } | undefined;
      const push = (): void => {
        const next = value();
        if (last && last.value === next) return;
        last = { value: next };
        emit(next === undefined ? { found: false } : { found: true, value: next });
      };
      push();
      return chain.onChange(push);
    });

  const ledgerParameters = options.ledgerParameters ?? new Uint8Array(1);
  const zswapChainState = options.zswapChainState ?? new Uint8Array(1);
  const events = new Map<string, readonly Uint8Array[]>();

  return {
    contractState: (address, o) => read(o?.signal, () => chain.contract(address)),
    ledgerParameters: (o) =>
      read(o?.signal, () => ({ bytes: ledgerParameters.slice(), block: GENESIS })),
    callInputs: (address, o) =>
      read(o?.signal, () => {
        const state = chain.contract(address);
        return (
          state && {
            state,
            ledgerParameters: ledgerParameters.slice(),
            zswapChainState: zswapChainState.slice(),
            block: state.block,
          }
        );
      }),
    zswapEvents: (block, o) =>
      read(o?.signal, () => events.get(block.hash)?.map((event) => event.slice())),
    transaction: (id, o) => read(o?.signal, () => chain.status(id)),
    watchContract: (address) => watch(() => chain.contract(address)),
    watchTransaction: (id) => watch(() => chain.status(id)),
    holdNext: () => hold.next(),
    failReads(count) {
      failing = count;
    },
    setZswapEvents(block, list) {
      events.set(
        block.hash,
        list.map((event) => event.slice()),
      );
    },
  };
}
