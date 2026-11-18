import type { ContractAddress, ContractState } from '@midnight-ntwrk/mn-passport-core';
import type { NodeStateRead } from './node.js';
import type { IndexerStateRead } from './reads.js';

export const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, i) => byte === b[i]);

/**
 * The node's state wins only when its block is above the indexer's head and the indexer has no
 * state or different bytes. An indexer with no block yet is below every node block.
 */
export function mergeState(
  address: ContractAddress,
  indexer: IndexerStateRead,
  node: NodeStateRead | undefined,
): ContractState | undefined {
  if (node === undefined) return indexer.state;
  const higher = indexer.head === undefined || node.block.height > indexer.head.height;
  if (!higher) return indexer.state;
  if (indexer.state !== undefined && sameBytes(indexer.state.bytes, node.bytes)) {
    return indexer.state;
  }
  return { address, bytes: node.bytes, block: node.block };
}
