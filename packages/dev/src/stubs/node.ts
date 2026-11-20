import type { BlockRef, HttpRequest, HttpResponse } from '@midnight-ntwrk/mn-passport-core';

export type RpcAnswer =
  | { readonly result: unknown }
  | { readonly error: { readonly code: number; readonly message?: string } };

export type RpcMethod = (params: readonly unknown[]) => RpcAnswer | Promise<RpcAnswer>;

/**
 * A node over JSON-RPC that knows `chain_getBlockHash` and `chain_getHeader`. On the wire a
 * hash has a `0x` prefix and a block number is hex, as on midnight-node.
 */
export interface StubNode {
  /** Give it to `createStubPlatform` as `http`, or to `answer`. */
  readonly http: (request: HttpRequest) => Promise<HttpResponse>;
  /** Adds a block on top of the best block, and makes it the best block. */
  addBlock(): BlockRef;
  best(): BlockRef;
  /** Answers each later call of `method`. Without it, the method is not found. */
  on(method: string, answer: RpcMethod): void;
}

interface Block extends BlockRef {
  readonly parent: string;
}

const METHOD_NOT_FOUND = -32601;
const PARSE_ERROR = -32700;

const hashAt = (height: number): string => height.toString(16).padStart(64, '0');
const wire = (hash: string): string => `0x${hash}`;

function body(request: HttpRequest): { id?: unknown; method?: unknown; params?: unknown } {
  const text =
    typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body);
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null ? value : {};
  } catch {
    return {};
  }
}

/** Starts with the genesis block, at height 0. */
export function createStubNode(): StubNode {
  const genesis: Block = { height: 0, hash: hashAt(0), parent: hashAt(0) };
  const blocks: Block[] = [genesis];
  const methods = new Map<string, RpcMethod>();
  const best = (): Block => blocks[blocks.length - 1] ?? genesis;
  const header = (block: Block | undefined) =>
    block && { number: `0x${block.height.toString(16)}`, parentHash: wire(block.parent) };

  methods.set('chain_getBlockHash', ([height]) => {
    if (height === undefined || height === null) return { result: wire(best().hash) };
    const block = typeof height === 'number' ? blocks[height] : undefined;
    return { result: block ? wire(block.hash) : null };
  });
  methods.set('chain_getHeader', ([hash]) => {
    if (hash === undefined || hash === null) return { result: header(best()) };
    return { result: header(blocks.find((block) => wire(block.hash) === hash)) ?? null };
  });

  return {
    async http(request) {
      const { id = null, method, params } = body(request);
      const call = typeof method === 'string' ? methods.get(method) : undefined;
      const answer: RpcAnswer =
        typeof method !== 'string'
          ? { error: { code: PARSE_ERROR } }
          : call
            ? await call(Array.isArray(params) ? params : [])
            : { error: { code: METHOD_NOT_FOUND, message: `${method} is not found` } };
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: new TextEncoder().encode(JSON.stringify({ jsonrpc: '2.0', id, ...answer })),
      };
    },
    addBlock() {
      const block = { height: blocks.length, hash: hashAt(blocks.length), parent: best().hash };
      blocks.push(block);
      return { height: block.height, hash: block.hash };
    },
    best() {
      const { height, hash } = best();
      return { height, hash };
    },
    on(method, answer) {
      methods.set(method, answer);
    },
  };
}
