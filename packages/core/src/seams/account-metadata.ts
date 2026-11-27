import type { CallOptions } from './common.js';

export interface MetadataEntry {
  readonly namespace: string;
  /** Goes up by one on each write. Revisions never repeat, even after a delete. */
  readonly revision: number;
  readonly data: Uint8Array;
}

/**
 * Each origin of the provider can read the entries: never write a secret in readable form.
 * A write or delete with a stale `revision` rejects with `MetadataConflictError`.
 */
export interface AccountMetadata {
  readonly maxEntryBytes: number;
  read(namespace: string, options?: CallOptions): Promise<MetadataEntry | undefined>;
  /**
   * `revision` is the one that the caller read, `undefined` for a new entry.
   * Resolves after a read-back. Data over `maxEntryBytes` rejects with
   * `MetadataTooLargeError` before any network call.
   */
  write(
    namespace: string,
    data: Uint8Array,
    revision: number | undefined,
    options?: CallOptions,
  ): Promise<MetadataEntry>;
  delete(namespace: string, revision: number, options?: CallOptions): Promise<void>;
}
