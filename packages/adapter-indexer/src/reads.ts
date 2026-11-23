import {
  IndexerUnreachableError,
  type BlockRef,
  type CallInputs,
  type CallOptions,
  type ContractAddress,
  type ContractState,
  type HttpRequest,
  type HttpResponse,
  type Indexer,
  type LedgerParametersRead,
  type TransactionId,
  type TransactionResult,
  type TransactionStatus,
} from '@midnight-ntwrk/mn-passport-core';
import { query } from './graphql.js';
import { decodeHex } from './hex.js';
import { mergeState } from './merge.js';
import { readNodeState } from './node.js';
import { ownSignal, type Data, type Endpoint } from './transport.js';

// Keep these in step with the indexer API of the pinned midnight-js version.
const CONTRACT_STATE_QUERY = `query CONTRACT_STATE_QUERY($address: HexEncoded!) {
  block { height hash }
  contract(address: $address) { state stateAt { height hash } }
}`;

const TX_ID_QUERY = `query TX_ID_QUERY($offset: TransactionOffset!) {
  transactions(offset: $offset) {
    __typename
    block { height hash }
    ... on RegularTransaction { transactionResult { status } }
  }
}`;

const HEAD_QUERY = `query HEAD_QUERY { block { height hash } }`;

const LEDGER_PARAMETERS_QUERY = `query LEDGER_PARAMETERS_QUERY { block { height hash ledgerParameters } }`;

// Pinned to one hash. Unpinned, `block` and `contract` each follow the tip and can name two blocks.
const CALL_INPUTS_QUERY = `query CALL_INPUTS_QUERY($address: HexEncoded!, $offset: BlockOffset!) {
  block(offset: $offset) { height hash ledgerParameters contractZswapState(address: $address) }
  contract(address: $address, offset: $offset) { state stateAt { height hash } }
}`;

const ZSWAP_EVENTS_QUERY = `query ZSWAP_EVENTS_QUERY($offset: BlockOffset!) {
  block(offset: $offset) { height hash transactions { zswapLedgerEvents { raw } } }
}`;

// A `Map`, so a status such as "constructor" finds nothing on the prototype.
const RESULTS: ReadonlyMap<unknown, TransactionResult> = new Map<unknown, TransactionResult>([
  ['SUCCESS', 'succeeded'],
  ['PARTIAL_SUCCESS', 'partly-failed'],
  ['FAILURE', 'failed'],
]);

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

const bytesOf = (value: unknown): Uint8Array => decodeHex(value) ?? malformed();

/** An indexer with no block yet is unreachable: nothing can be built on it. */
export async function readLedgerParameters(
  endpoint: Endpoint,
  options?: CallOptions,
): Promise<LedgerParametersRead> {
  const head = (await query(endpoint, LEDGER_PARAMETERS_QUERY, {}, options)).block;
  return { bytes: bytesOf(field(head, 'ledgerParameters')), block: blockRef(head) };
}

export async function readCallInputs(
  endpoint: Endpoint,
  address: ContractAddress,
  options?: CallOptions,
): Promise<CallInputs | undefined> {
  const head = blockRef((await query(endpoint, HEAD_QUERY, {}, options)).block);
  const variables = { address, offset: { hash: head.hash } };
  const data = await query(endpoint, CALL_INPUTS_QUERY, variables, options);
  const block = blockRef(data.block);
  if (block.hash !== head.hash) return malformed();
  const zswap = field(data.block, 'contractZswapState');
  // Only both `null` is "no contract". One `null` alone fails below.
  if (data.contract === null && zswap === null) return undefined;
  const bytes = bytesOf(field(data.contract, 'state'));
  return {
    state: { address, bytes, block: blockRef(field(data.contract, 'stateAt')) },
    ledgerParameters: bytesOf(field(data.block, 'ledgerParameters')),
    zswapChainState: bytesOf(zswap),
    block,
  };
}

const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : malformed());

export async function readZswapEvents(
  endpoint: Endpoint,
  at: BlockRef,
  options?: CallOptions,
): Promise<readonly Uint8Array[] | undefined> {
  const data = await query(endpoint, ZSWAP_EVENTS_QUERY, { offset: { hash: at.hash } }, options);
  if (data.block === null) return undefined;
  if (blockRef(data.block).hash !== at.hash.toLowerCase()) return malformed();
  return list(field(data.block, 'transactions')).flatMap((tx) =>
    list(field(tx, 'zswapLedgerEvents')).map((event) => bytesOf(field(event, 'raw'))),
  );
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

/** The indexer holds final blocks only, so a found transaction is `final`. */
export async function readTransaction(
  endpoint: Endpoint,
  id: TransactionId,
  options?: CallOptions,
): Promise<TransactionStatus | undefined> {
  const data = await query(endpoint, TX_ID_QUERY, { offset: { identifier: id } }, options);
  const found = data.transactions;
  if (!Array.isArray(found)) return malformed();
  // Only a regular transaction has identifiers. The first one is the match.
  const kinds = found.map((tx) => field(tx, '__typename'));
  if (kinds.some((kind) => typeof kind !== 'string')) return malformed();
  const match: unknown = found[kinds.indexOf('RegularTransaction')];
  if (match === undefined) return undefined;
  const status = field(field(match, 'transactionResult'), 'status');
  const result = RESULTS.get(status);
  if (result === undefined) return malformed();
  return { id, level: 'final', block: blockRef(field(match, 'block')), result };
}

export interface ReadOptions {
  /** The indexer's GraphQL endpoint over HTTP. */
  readonly indexerUrl: string;
  /**
   * The node's JSON-RPC endpoint over HTTP. Without it, state reads use the indexer only. A state
   * from the indexer has the block where it last changed. A state from the node has the node's
   * best block, and that block can still be reverted.
   */
  readonly nodeUrl?: string;
  readonly http: (request: HttpRequest) => Promise<HttpResponse>;
  /** For each indexer request, and for the whole node read. Default: 10,000. */
  readonly requestTimeoutMs?: number;
}

export interface StateRead {
  readonly state: ContractState | undefined;
  /** `true` when the state came from the node. */
  readonly fromNode: boolean;
  readonly indexerHead: BlockRef | undefined;
  /** The block of the node's answer, also when the indexer's state wins. */
  readonly nodeBlock: BlockRef | undefined;
}

export interface Reads extends Pick<
  Indexer,
  'contractState' | 'transaction' | 'ledgerParameters' | 'callInputs' | 'zswapEvents'
> {
  /** `contractState` with where the state came from. */
  readState(address: ContractAddress, options?: CallOptions): Promise<StateRead>;
}

export function createReads(options: ReadOptions): Reads {
  const timeoutMs = options.requestTimeoutMs ?? 10_000;
  const indexer: Endpoint = { url: options.indexerUrl, http: options.http, timeoutMs };
  const node: Endpoint | undefined =
    options.nodeUrl === undefined
      ? undefined
      : { url: options.nodeUrl, http: options.http, timeoutMs };
  async function readState(address: ContractAddress, call?: CallOptions): Promise<StateRead> {
    if (node === undefined) {
      const { head, state } = await readContractState(indexer, address, call);
      return { state, fromNode: false, indexerHead: head, nodeBlock: undefined };
    }
    const nodeCall = ownSignal(call?.signal);
    try {
      const [fromIndexer, fromNode] = await Promise.all([
        readContractState(indexer, address, call),
        readNodeState(node, address, { signal: nodeCall.signal }),
      ]);
      const state = mergeState(address, fromIndexer, fromNode);
      // The merge gives the indexer's own object unless the node wins.
      const nodeWon = state !== undefined && state !== fromIndexer.state;
      return {
        state,
        fromNode: nodeWon,
        indexerHead: fromIndexer.head,
        nodeBlock: fromNode?.block,
      };
    } finally {
      // Also stops the node read when the indexer fails first.
      nodeCall.abort();
      nodeCall.dispose();
    }
  }
  return {
    readState,
    contractState: async (address, call) => (await readState(address, call)).state,
    transaction: (id, call) => readTransaction(indexer, id, call),
    // The node has no parameters or Zswap state, so these reads never use it.
    ledgerParameters: (call) => readLedgerParameters(indexer, call),
    callInputs: (address, call) => readCallInputs(indexer, address, call),
    zswapEvents: (block, call) => readZswapEvents(indexer, block, call),
  };
}
