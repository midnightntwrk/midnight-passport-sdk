import {
  IndexerUnreachableError,
  type BlockRef,
  type CallOptions,
  type ContractAddress,
  type ContractState,
  type HttpRequest,
  type HttpResponse,
  type Indexer,
} from '@midnight-ntwrk/mn-passport-core';
import { query } from './graphql.js';
import { decodeHex } from './hex.js';
import type { Data, Endpoint } from './transport.js';

// Keep this in step with the indexer API of the pinned midnight-js version.
const CONTRACT_STATE_QUERY = `query CONTRACT_STATE_QUERY($address: HexEncoded!) {
  block { height hash }
  contract(address: $address) { state stateAt { height hash } }
}`;

const HASH = /^[0-9a-fA-F]{64}$/;

const malformed = (): never => {
  throw new IndexerUnreachableError('response');
};

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return malformed();
  return (value as Data)[key];
}

function blockRef(value: unknown): BlockRef {
  const height = field(value, 'height');
  const hash = field(value, 'hash');
  if (typeof height !== 'number' || !Number.isSafeInteger(height) || height < 0) return malformed();
  if (typeof hash !== 'string' || !HASH.test(hash)) return malformed();
  return { height, hash: hash.toLowerCase() };
}

export interface IndexerStateRead {
  /** The latest block that the indexer holds, `undefined` before its first block. */
  readonly head: BlockRef | undefined;
  readonly state: ContractState | undefined;
}

export async function readContractState(
  endpoint: Endpoint,
  address: ContractAddress,
  options?: CallOptions,
): Promise<IndexerStateRead> {
  const data = await query(endpoint, CONTRACT_STATE_QUERY, { address }, options);
  if (!('block' in data) || !('contract' in data)) return malformed();
  const head = data.block === null ? undefined : blockRef(data.block);
  if (data.contract === null) return { head, state: undefined };
  const bytes = decodeHex(field(data.contract, 'state')) ?? malformed();
  return { head, state: { address, bytes, block: blockRef(field(data.contract, 'stateAt')) } };
}

export interface ReadOptions {
  /** The indexer's GraphQL endpoint over HTTP. */
  readonly indexerUrl: string;
  readonly http: (request: HttpRequest) => Promise<HttpResponse>;
  /** Default: 10,000. */
  readonly requestTimeoutMs?: number;
}

export function createReads(options: ReadOptions): Pick<Indexer, 'contractState'> {
  const endpoint: Endpoint = {
    url: options.indexerUrl,
    http: options.http,
    timeoutMs: options.requestTimeoutMs ?? 10_000,
  };
  return {
    contractState: async (address, call) =>
      (await readContractState(endpoint, address, call)).state,
  };
}
