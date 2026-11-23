import type {
  ContractAddress,
  Indexer,
  Lookup,
  StateSource,
  TransactionId,
  TransactionStatus,
} from '@midnight-ntwrk/mn-passport-core';
import {
  abortedSignal,
  check,
  expectCancel,
  expectRejection,
  guarded,
  type ContractCase,
} from '../contract.js';

export interface IndexerHarness {
  readonly indexer: Indexer;
  /** An address with a contract on the chain under test. */
  readonly contract: ContractAddress;
  /** Gives the id of a transaction before `submit` sends it. */
  readonly prepare: () => Promise<{ readonly id: TransactionId; submit(): Promise<void> }>;
  /** An indexer whose sources cannot be reached. */
  readonly unreachable: () => Promise<Indexer>;
  /** Makes the next read stay in flight until its signal aborts. */
  readonly hold: () => void;
  /** Bounds each wait. It must cover a block and finality on the chain under test. */
  readonly timeoutMs: number;
}

const unknownAddress = 'ff'.repeat(32);
const unknownId = 'ee'.repeat(32);

/** Resolves with every value up to the first that `done` accepts. */
function collect<A>(source: StateSource<A>, done: (value: A) => boolean, timeoutMs: number) {
  return new Promise<A[]>((resolve, reject) => {
    const seen: A[] = [];
    const timer = setTimeout(() => {
      stop();
      reject(new Error(`no accepted value in ${timeoutMs} ms; saw ${JSON.stringify(seen)}`));
    }, timeoutMs);
    const stop = source.subscribe(
      (value) => {
        seen.push(value);
        if (!done(value)) return;
        clearTimeout(timer);
        queueMicrotask(() => stop());
        resolve(seen);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const isFinal = (lookup: Lookup<TransactionStatus>): boolean =>
  lookup.found && lookup.value.level === 'final';

export function indexerContract(
  make: () => Promise<IndexerHarness>,
  guardMs = 10_000,
): ContractCase[] {
  return guarded(
    [
      {
        name: 'an unknown address and an unknown id read as undefined',
        async run() {
          const { indexer } = await make();
          check((await indexer.contractState(unknownAddress)) === undefined, 'found a contract');
          check((await indexer.transaction(unknownId)) === undefined, 'found a transaction');
          check((await indexer.callInputs(unknownAddress)) === undefined, 'found call inputs');
        },
      },
      {
        name: 'a known contract reads with its address and state',
        async run() {
          const { indexer, contract, timeoutMs } = await make();
          const state = await indexer.contractState(contract);
          check(state?.address === contract, 'the contract is missing');
          check(state.bytes.length > 0, 'the contract state is empty');
          const [first] = await collect(indexer.watchContract(contract), () => true, timeoutMs);
          check(first?.found === true, 'the watch did not find the contract');
        },
      },
      {
        name: 'the call inputs of a known contract are all as of one block',
        async run() {
          const { indexer, contract } = await make();
          const inputs = await indexer.callInputs(contract);
          check(inputs?.state.address === contract, 'the call inputs are missing');
          check(inputs.state.bytes.length > 0, 'the contract state is empty');
          check(inputs.ledgerParameters.length > 0, 'the ledger parameters are empty');
          check(inputs.zswapChainState.length > 0, 'the Zswap state is empty');
          check(inputs.state.block.height <= inputs.block.height, 'the state is after its block');
          const parameters = await indexer.ledgerParameters();
          check(parameters.bytes.length > 0, 'the ledger parameters are empty');
        },
      },
      {
        name: 'a transaction watch starts at not found, ends at final, and never goes back',
        async run() {
          const { indexer, prepare, timeoutMs } = await make();
          const { id, submit } = await prepare();
          const seen = collect(indexer.watchTransaction(id), isFinal, timeoutMs);
          await submit();
          const levels = (await seen).map((lookup) => (lookup.found ? lookup.value.level : 'none'));
          check(levels[0] === 'none', `the first value was ${String(levels[0])}`);
          const ranks = levels.map((level) => ['none', 'in-block', 'final'].indexOf(level));
          check(
            ranks.every((rank, i) => i === 0 || rank >= (ranks[i - 1] ?? 0)),
            `the levels went back: ${levels.join(', ')}`,
          );
          const read = await indexer.transaction(id);
          check(read?.level === 'final', 'the read is not final');
          check(read.result !== undefined, 'a final status has no result');
        },
      },
      {
        name: 'an unreachable source is IndexerUnreachableError, never "not found", and an abort still cancels',
        async run() {
          const { unreachable, timeoutMs } = await make();
          const indexer = await unreachable();
          const tag = 'IndexerUnreachableError';
          await expectRejection(() => indexer.contractState(unknownAddress), tag);
          await expectRejection(() => indexer.transaction(unknownId), tag);
          await expectRejection(() => indexer.callInputs(unknownAddress), tag);
          await expectRejection(() => indexer.ledgerParameters(), tag);
          const watchContract = () =>
            collect(indexer.watchContract(unknownAddress), () => true, timeoutMs);
          await expectRejection(watchContract, tag);
          const watchTx = () => collect(indexer.watchTransaction(unknownId), () => true, timeoutMs);
          await expectRejection(watchTx, tag);
          const signal = abortedSignal();
          await expectRejection(
            () => indexer.contractState(unknownAddress, { signal }),
            'CancelledError',
          );
        },
      },
      {
        name: 'an abort before or during a read rejects with CancelledError',
        async run() {
          const { indexer, contract, hold } = await make();
          await expectCancel((signal) => indexer.contractState(contract, { signal }), hold);
          await expectCancel((signal) => indexer.callInputs(contract, { signal }), hold);
        },
      },
    ],
    guardMs,
  );
}
