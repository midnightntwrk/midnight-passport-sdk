import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MetadataTooLargeError,
  UpstreamError,
  type AccountMetadata,
  type Indexer,
} from '@midnight-ntwrk/mn-passport-core';
import {
  accountMetadataContract,
  createStubAccountMetadata,
  createStubChain,
  createStubFees,
  createStubIndexer,
  indexerContract,
  type AccountMetadataHarness,
  type IndexerHarness,
} from '@midnight-ntwrk/mn-passport-dev';
import { expectFailing, guardMs, run } from './run.js';

const contract = 'aa'.repeat(32);
const harness = (
  wrap: (i: Indexer) => Indexer = (i) => i,
  unreachable = async () => createStubIndexer(createStubChain(), { unreachable: true }),
): IndexerHarness => {
  const chain = createStubChain();
  chain.setContract(contract, new Uint8Array([1]));
  const fees = createStubFees();
  const stub = createStubIndexer(chain);
  return {
    indexer: wrap(stub),
    contract,
    async prepare() {
      const paid = await fees.pay({ stage: 'proven', bytes: new Uint8Array([1]) });
      return { id: paid.id, submit: async () => chain.receive(paid) };
    },
    unreachable,
    hold: () => stub.holdNext(),
    timeoutMs: 1_000,
  };
};
run(
  'stub indexer',
  indexerContract(async () => harness()),
);

const metadataHarness = (
  wrap: (m: AccountMetadata) => AccountMetadata = (m) => m,
): AccountMetadataHarness => {
  const stub = createStubAccountMetadata();
  return { metadata: wrap(stub), writes: () => stub.writes(), hold: () => stub.holdNext() };
};
run(
  'stub account metadata',
  accountMetadataContract(async () => metadataHarness()),
);

const strictIndexer = (i: Indexer): Indexer => ({
  ...i,
  async contractState(address, options) {
    const state = await i.contractState(address, options);
    if (!state) throw new UpstreamError({ sourceTag: 'Test' });
    return state;
  },
});
expectFailing(
  'the indexer contract fails an indexer that reads "not found" as an error',
  indexerContract(async () => harness(strictIndexer)),
  [['an unknown address and an unknown id read as undefined', 'An upstream call failed']],
);

const empty = async () => createStubIndexer(createStubChain());
expectFailing(
  'the indexer contract fails an unreachable indexer that reads as "not found"',
  indexerContract(async () => harness(undefined, empty)),
  [
    [
      'an unreachable source is IndexerUnreachableError, never "not found", and an abort still cancels',
      'expected a rejection with IndexerUnreachableError, got a result',
    ],
  ],
);

const notFound = async () => ({
  ...createStubIndexer(createStubChain(), { unreachable: true }),
  callInputs: async () => undefined,
});
expectFailing(
  'the indexer contract fails call inputs that read an outage as "not found"',
  indexerContract(async () => harness(undefined, notFound)),
  [
    [
      'an unreachable source is IndexerUnreachableError, never "not found", and an abort still cancels',
      'expected a rejection with IndexerUnreachableError, got a result',
    ],
  ],
);

const last = (m: AccountMetadata): AccountMetadata => ({
  ...m,
  write: async (namespace, data, _revision, options) =>
    m.write(namespace, data, (await m.read(namespace, options))?.revision, options),
});
expectFailing(
  'the metadata contract fails a provider where the last write wins',
  accountMetadataContract(async () => metadataHarness(last)),
  [
    [
      'a stale revision rejects with MetadataConflictError',
      'expected a rejection with MetadataConflictError, got a result',
    ],
    [
      'delete removes the entry, and its revision never comes back',
      'expected a rejection with MetadataConflictError, got a result',
    ],
  ],
);

const atLimit = (m: AccountMetadata): AccountMetadata => ({
  ...m,
  write: async (namespace, data, revision, options) => {
    if (data.length >= m.maxEntryBytes)
      throw new MetadataTooLargeError(data.length, m.maxEntryBytes);
    return m.write(namespace, data, revision, options);
  },
});
expectFailing(
  'the metadata contract fails a limit that rejects an entry at the limit',
  accountMetadataContract(async () => metadataHarness(atLimit)),
  [
    [
      'an entry at the limit is kept, and one over it rejects before any write',
      'The metadata entry is 2048 bytes',
    ],
  ],
);

const deafWrite = (m: AccountMetadata): AccountMetadata => ({
  ...m,
  write: (namespace, data, revision) => m.write(namespace, data, revision),
});
expectFailing(
  'the metadata contract fails a write that ignores the signal',
  accountMetadataContract(async () => metadataHarness(deafWrite), guardMs),
  [
    [
      'an abort before or during a read or a write rejects with CancelledError',
      'expected a rejection with CancelledError, got a result',
    ],
  ],
);

const id = 'cc'.repeat(32);

test('the stub indexer fails the next reads, then reads again', async () => {
  const indexer = createStubIndexer(createStubChain());
  indexer.failReads(2);
  await assert.rejects(indexer.transaction(id), { _tag: 'IndexerUnreachableError' });
  await assert.rejects(indexer.contractState(contract), { _tag: 'IndexerUnreachableError' });
  assert.equal(await indexer.transaction(id), undefined);
});

test('a scripted status reaches the reads and the watches of the stub indexer', async () => {
  const chain = createStubChain();
  const indexer = createStubIndexer(chain);
  const levels: string[] = [];
  const stop = indexer
    .watchTransaction(id)
    .subscribe((lookup) => levels.push(lookup.found ? lookup.value.level : 'none'));
  const block = { height: 7, hash: '07'.repeat(32) };
  chain.setStatus({ id, level: 'final', block, result: 'failed' });
  stop();
  assert.deepEqual(levels, ['none', 'final']);
  assert.equal((await indexer.transaction(id))?.result, 'failed');
});
