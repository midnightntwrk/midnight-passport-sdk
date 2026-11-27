import { openAccArtifact, type AccArtifact, type ArtifactRead } from './artifact.js';
import { armsOf, pinnedKey, type ArmsReport } from './deployed.js';
import { AmbiguousBindingError, UnknownBindingError } from './errors.js';
import { ACC_MANIFEST_SHA256 } from './pin.js';

/** `unsupported`: the build is known, but the caller must not build a call for it. */
export type BindingStatus = 'current' | 'supported' | 'unsupported';

/** A row stays while accounts of its build exist. Its status only moves down. */
export interface BindingRow {
  readonly manifestHash: string;
  readonly status: BindingStatus;
}

export const BINDINGS: readonly BindingRow[] = Object.freeze([
  Object.freeze({ manifestHash: ACC_MANIFEST_SHA256, status: 'current' }),
]);

export interface Identified extends Omit<ArmsReport, 'changed'> {
  readonly artifact: AccArtifact;
  readonly status: BindingStatus;
}

/**
 * Reads only the manifest of each row, checked against the row's hash. One failed read rejects
 * the call, because the skipped row could be a second match.
 */
export function identifyBinding(
  onChain: ReadonlyMap<string, string>,
  readFor: (row: BindingRow) => ArtifactRead,
): Promise<Identified> {
  return identifyIn(BINDINGS, onChain, readFor);
}

/** Not exported from the package, so that no caller can add its own row. */
export async function identifyIn(
  table: readonly BindingRow[],
  onChain: ReadonlyMap<string, string>,
  readFor: (row: BindingRow) => ArtifactRead,
): Promise<Identified> {
  const opened = await Promise.all(
    table.map(async (row) => ({
      row,
      artifact: await openAccArtifact(readFor(row), row.manifestHash),
    })),
  );
  // An account with no key would match every build.
  const found = opened.filter(
    ({ artifact }) =>
      onChain.size > 0 &&
      [...onChain].every(([circuit, key]) => pinnedKey(artifact.manifest, circuit) === key),
  );
  const [first, ...rest] = found;
  if (!first) throw new UnknownBindingError();
  if (rest.length > 0) throw new AmbiguousBindingError(found.map(({ row }) => row.manifestHash));
  const { arms, missing } = armsOf(first.artifact.manifest, onChain);
  return { artifact: first.artifact, status: first.row.status, arms, missing };
}
