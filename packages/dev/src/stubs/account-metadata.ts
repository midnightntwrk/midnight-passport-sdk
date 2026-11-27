import {
  MetadataConflictError,
  MetadataTooLargeError,
  type AccountMetadata,
  type MetadataEntry,
} from '@midnight-ntwrk/mn-passport-core';
import { createHold } from '../abort.js';

export interface StubAccountMetadata extends AccountMetadata {
  /** The count of writes that changed an entry. */
  writes(): number;
  /** The next call stays in flight until its signal aborts. */
  holdNext(): void;
}

/** The default limit is the smallest that a known provider keeps. */
export function createStubAccountMetadata(maxEntryBytes = 2048): StubAccountMetadata {
  const entries = new Map<string, MetadataEntry>();
  // Kept after a delete, so that a revision never repeats.
  const lastRevision = new Map<string, number>();
  let writes = 0;
  const hold = createHold();
  const checkRevision = (namespace: string, revision: number | undefined): void => {
    if (entries.get(namespace)?.revision !== revision) throw new MetadataConflictError(namespace);
  };
  const copy = (entry: MetadataEntry): MetadataEntry => ({ ...entry, data: entry.data.slice() });
  return {
    maxEntryBytes,
    read: (namespace, options) =>
      hold.run(options?.signal, () => {
        const entry = entries.get(namespace);
        return entry && copy(entry);
      }),
    write: (namespace, data, revision, options) =>
      hold.run(options?.signal, () => {
        if (data.length > maxEntryBytes)
          throw new MetadataTooLargeError(data.length, maxEntryBytes);
        checkRevision(namespace, revision);
        const next = (lastRevision.get(namespace) ?? 0) + 1;
        const entry = { namespace, revision: next, data: data.slice() };
        entries.set(namespace, entry);
        lastRevision.set(namespace, next);
        writes++;
        return copy(entry);
      }),
    delete: (namespace, revision, options) =>
      hold.run(options?.signal, () => {
        checkRevision(namespace, revision);
        entries.delete(namespace);
      }),
    writes: () => writes,
    holdNext: () => hold.next(),
  };
}
