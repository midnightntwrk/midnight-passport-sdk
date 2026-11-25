import type { AccountMetadata } from '@midnight-ntwrk/mn-passport-core';
import { check, expectCancel, expectRejection, guarded, type ContractCase } from '../contract.js';

export interface AccountMetadataHarness {
  readonly metadata: AccountMetadata;
  /** The count of writes that reached the provider. Without it, the size case checks only the read-back. */
  readonly writes?: () => number;
  /** Makes the next call stay in flight until its signal aborts. */
  readonly hold: () => void;
}

const data = new Uint8Array([1, 2, 3]);

// Each case gets its own namespace, so a provider that keeps entries between runs still starts empty.
const freshNamespace = (): string =>
  `contract-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function accountMetadataContract(
  make: () => Promise<AccountMetadataHarness>,
  guardMs = 10_000,
): ContractCase[] {
  return guarded(
    [
      {
        name: 'a write reads back, and its revision goes up',
        async run() {
          const { metadata } = await make();
          const ns = freshNamespace();
          check((await metadata.read(ns)) === undefined, 'a new namespace has an entry');
          const first = await metadata.write(ns, data, undefined);
          const second = await metadata.write(ns, new Uint8Array([4]), first.revision);
          check(second.revision === first.revision + 1, 'the revision did not go up by one');
          const read = await metadata.read(ns);
          check(read?.revision === second.revision && read.data.join() === '4', 'bad read-back');
        },
      },
      {
        name: 'a stale revision rejects with MetadataConflictError',
        async run() {
          const { metadata } = await make();
          const ns = freshNamespace();
          const first = await metadata.write(ns, data, undefined);
          await metadata.write(ns, data, first.revision);
          const conflict = 'MetadataConflictError';
          await expectRejection(() => metadata.write(ns, data, first.revision), conflict);
          await expectRejection(() => metadata.write(ns, data, undefined), conflict);
          await expectRejection(() => metadata.delete(ns, first.revision), conflict);
        },
      },
      {
        name: 'an entry at the limit is kept, and one over it rejects before any write',
        async run() {
          const { metadata, writes } = await make();
          const ns = freshNamespace();
          const before = writes?.();
          const big = new Uint8Array(metadata.maxEntryBytes + 1);
          await expectRejection(() => metadata.write(ns, big, undefined), 'MetadataTooLargeError');
          check(writes?.() === before, 'the provider got a write');
          check((await metadata.read(ns)) === undefined, 'the entry was written');
          await metadata.write(ns, big.subarray(1), undefined);
          const read = await metadata.read(ns);
          check(read?.data.length === metadata.maxEntryBytes, 'an entry at the limit was lost');
        },
      },
      {
        name: 'delete removes the entry, and its revision never comes back',
        async run() {
          const { metadata } = await make();
          const ns = freshNamespace();
          const old = await metadata.write(ns, data, undefined);
          await metadata.delete(ns, old.revision);
          check((await metadata.read(ns)) === undefined, 'delete left the entry');
          const fresh = await metadata.write(ns, data, undefined);
          check(fresh.revision > old.revision, 'a revision came back after the delete');
          await expectRejection(
            () => metadata.write(ns, data, old.revision),
            'MetadataConflictError',
          );
        },
      },
      {
        name: 'an abort before or during a read or a write rejects with CancelledError',
        async run() {
          const { metadata, hold } = await make();
          const ns = freshNamespace();
          await expectCancel((signal) => metadata.read(ns, { signal }), hold);
          await expectCancel((signal) => metadata.write(ns, data, undefined, { signal }), hold);
          check((await metadata.read(ns)) === undefined, 'a cancelled write was kept');
        },
      },
    ],
    guardMs,
  );
}
