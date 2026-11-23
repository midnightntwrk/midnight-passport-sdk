import { afterEach, test } from 'node:test';
import { createIndexer } from '../packages/adapter-indexer/dist/index.js';
import {
  createStubChain,
  createStubFees,
  createStubNode,
  indexerContract,
} from '../packages/dev/dist/index.js';
import { parseJson } from '../scripts/json.mjs';

/** @typedef {import('../packages/core/dist/index.js').Indexer} Indexer */
/** @typedef {import('../packages/core/dist/index.js').HttpRequest} HttpRequest */
/** @typedef {import('../packages/core/dist/index.js').HttpResponse} HttpResponse */
/** @typedef {import('../packages/core/dist/index.js').BlockRef} BlockRef */

const contract = 'aa'.repeat(32);
const INDEXER_URL = 'https://indexer.test/graphql';
const NODE_URL = 'https://node.test';

/** @param {unknown} value @returns {HttpResponse} */
const ok = (value) => ({
  status: 200,
  headers: {},
  body: new TextEncoder().encode(JSON.stringify(value)),
});

/** @param {Uint8Array} bytes */
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
/** @param {(BlockRef | undefined)[]} blocks */
const highest = (blocks) =>
  blocks.reduce(
    (top, block) => (block && (!top || block.height > top.height) ? block : top),
    /** @type {BlockRef | undefined} */ (undefined),
  );

/**
 * An indexer and a node over one stub chain. The indexer sees final transactions only.
 * @param {ReturnType<typeof createStubChain>} chain
 * @param {Set<string>} ids the transactions that the harness made
 * @returns {(request: HttpRequest) => Promise<HttpResponse>}
 */
function chainHttp(chain, ids) {
  const statuses = () => [...ids].map((id) => chain.status(id));
  const finalHead = () =>
    highest([
      chain.contract(contract)?.block,
      ...statuses().map((s) => (s?.level === 'final' ? s.block : undefined)),
    ]);
  const bestHead = () =>
    highest([chain.contract(contract)?.block, ...statuses().map((s) => s?.block)]);
  const node = createStubNode();
  node.on('midnight_contractState', ([address]) => {
    const state = typeof address === 'string' ? chain.contract(address) : undefined;
    return state ? { result: hex(state.bytes) } : { error: { code: -32602 } };
  });
  /** @param {HttpRequest} request @returns {Promise<HttpResponse>} */
  const indexer = async (request) => {
    const body =
      /** @type {{ query: string, variables: { address: string, offset: { identifier: string, hash: string } } }} */ (
        parseJson(String(request.body))
      );
    const state = body.variables?.address ? chain.contract(body.variables.address) : undefined;
    const contractData = (state && { state: hex(state.bytes), stateAt: state.block }) ?? null;
    const head = finalHead() ?? null;
    if (body.query.includes('CONTRACT_STATE_QUERY')) {
      return ok({ data: { block: head, contract: contractData } });
    }
    if (body.query.includes('HEAD_QUERY')) return ok({ data: { block: head } });
    if (body.query.includes('LEDGER_PARAMETERS_QUERY')) {
      return ok({ data: { block: head && { ...head, ledgerParameters: '01' } } });
    }
    // The fake has the head block only.
    const pinned = head?.hash === body.variables.offset.hash ? head : null;
    if (body.query.includes('CALL_INPUTS_QUERY')) {
      const zswap = contractData && '02';
      const block = pinned && { ...pinned, ledgerParameters: '01', contractZswapState: zswap };
      return ok({ data: { block, contract: contractData } });
    }
    const status = chain.status(body.variables.offset.identifier);
    const found = status?.level === 'final';
    const tx = found && {
      __typename: 'RegularTransaction',
      block: status.block,
      transactionResult: { status: 'SUCCESS' },
    };
    return ok({ data: { transactions: tx ? [tx] : [] } });
  };
  return async (request) => {
    if (request.url === INDEXER_URL) return indexer(request);
    const head = bestHead();
    if (!head) throw new Error('the stub chain has no block');
    while (node.best().height < head.height) node.addBlock();
    return node.http(request);
  };
}

/** @type {(() => void)[]} */
const open = [];

// The contract's `collect` does not unsubscribe after an error, so each case stops its watches here.
/** @param {Indexer} indexer @returns {Indexer} */
const tracked = (indexer) => ({
  ...indexer,
  watchContract: (address) => track(indexer.watchContract(address)),
  watchTransaction: (id) => track(indexer.watchTransaction(id)),
});
/**
 * @template A
 * @param {import('../packages/core/dist/index.js').StateSource<A>} source
 * @returns {import('../packages/core/dist/index.js').StateSource<A>}
 */
const track = (source) => ({
  current: () => source.current(),
  subscribe(listener, onError) {
    const stop = source.subscribe(listener, onError);
    open.push(stop);
    return stop;
  },
});
afterEach(() => {
  for (const stop of open.splice(0)) stop();
});

const timing = { pollMs: 10, maxBackoffMs: 40, requestTimeoutMs: 1_000 };

/** @param {HttpRequest} request @returns {Promise<HttpResponse>} */
const pending = (request) =>
  new Promise((_resolve, reject) =>
    request.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
  );

const cases = indexerContract(async () => {
  const chain = createStubChain();
  chain.setContract(contract, new Uint8Array([1]));
  /** @type {Set<string>} */
  const ids = new Set();
  const fees = createStubFees();
  const answer = chainHttp(chain, ids);
  let held = false;
  // The read waits for the indexer answer, so a held indexer request keeps the read in flight.
  /** @param {HttpRequest} request */
  const http = (request) => {
    if (!held || request.url !== INDEXER_URL) return answer(request);
    held = false;
    return pending(request);
  };
  return {
    indexer: tracked(
      createIndexer({ indexerUrl: INDEXER_URL, nodeUrl: NODE_URL, http, ...timing }),
    ),
    contract,
    async prepare() {
      const paid = await fees.pay({ stage: 'proven', bytes: new Uint8Array([1]) });
      ids.add(paid.id);
      return { id: paid.id, submit: async () => chain.receive(paid) };
    },
    unreachable: async () =>
      tracked(
        createIndexer({
          indexerUrl: INDEXER_URL,
          nodeUrl: NODE_URL,
          http: () => Promise.reject(new Error('ECONNREFUSED')),
          ...timing,
        }),
      ),
    hold: () => {
      held = true;
    },
    timeoutMs: 1_000,
  };
});

for (const { name, run } of cases) test(`adapter-indexer: ${name}`, run);
