import { ProverRejectedError } from './errors.js';

export interface KeyLocation {
  readonly contractAddress: string;
  readonly circuitId: string;
  /** Lowercase hex SHA-256 of the deployed verifier key. */
  readonly verifierKeyHash: string;
}

export type ParsedKeyLocation =
  | { readonly kind: 'builtin'; readonly location: string }
  | ({ readonly kind: 'contract' } & KeyLocation);

// The circuit id charset keeps a location from naming a path on the service.
const CONTRACT = /^contract:([0-9a-fA-F]{64})\/([A-Za-z0-9_]+)\?vk=([0-9a-f]{64})$/;
// The label is the transaction author's choice, so no other name passes.
const BUILTINS = new Set(['midnight/zswap/spend', 'midnight/zswap/output', 'midnight/dust/spend']);

/**
 * Throws `ProverRejectedError` (`input`) for a malformed location or a bare circuit
 * name. Neither has a verifier key hash for the service to find the key by.
 */
export function parseKeyLocation(location: string): ParsedKeyLocation {
  if (BUILTINS.has(location)) return { kind: 'builtin', location };
  const match = CONTRACT.exec(location);
  const [, contractAddress, circuitId, verifierKeyHash] = match ?? [];
  if (contractAddress === undefined || circuitId === undefined || verifierKeyHash === undefined) {
    throw new ProverRejectedError('input');
  }
  return {
    kind: 'contract',
    contractAddress: contractAddress.toLowerCase(),
    circuitId,
    verifierKeyHash,
  };
}
