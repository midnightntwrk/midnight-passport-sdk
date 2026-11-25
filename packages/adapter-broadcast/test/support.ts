import {
  NetworkError,
  type HttpResponse,
  type ProvenTransaction,
} from '@midnight-ntwrk/mn-passport-core';
import { createStubPlatform, type HttpHandler } from '@midnight-ntwrk/mn-passport-dev';
import {
  ContractDeploy,
  ContractState,
  CostModel,
  Intent,
  Transaction,
  UnshieldedOffer,
  sampleRawTokenType,
  sampleUserAddress,
} from '@midnightntwrk/ledger-v9';

const text = new TextEncoder();
export const respond = (
  status: number,
  body: string,
  headers: Readonly<Record<string, string>> = {},
): HttpResponse => ({ status, headers, body: text.encode(body) });

export const never: HttpHandler = () => new Promise<HttpResponse>(() => {});
export const offline: HttpHandler = async () => {
  throw new NetworkError();
};

const refuse = (): never => {
  throw new Error('no contract call, so no proof request');
};

/** A real proven, unbound transaction with one intent. A deploy needs no proof request. */
export async function provenTx({
  deploy = false,
  randomSegment = false,
  ttlMs = 600_000,
  unshielded = undefined as 'guaranteed' | 'fallible' | undefined,
} = {}): Promise<ProvenTransaction> {
  const empty = Intent.new(new Date(Date.now() + ttlMs));
  const intent = deploy ? empty.addDeploy(new ContractDeploy(new ContractState())) : empty;
  if (unshielded) {
    const output = { value: 5n, owner: sampleUserAddress(), type: sampleRawTokenType() };
    intent[`${unshielded}UnshieldedOffer`] = UnshieldedOffer.new([], [output], []);
  }
  const parts = randomSegment ? Transaction.fromPartsRandomized : Transaction.fromParts;
  const unproven = parts('undeployed', undefined, undefined, intent);
  const proven = await unproven.prove(
    { check: refuse, lookupKey: refuse, prove: refuse },
    CostModel.initialCostModel(),
  );
  return { stage: 'proven', bytes: proven.serialize() };
}

/** The sponsor's fee intent: an intent of its own segment, with the coin lock's short ttl. */
export const feeIntent = async (ttlMs = 60_000): Promise<Uint8Array> =>
  (await provenTx({ randomSegment: true, ttlMs })).bytes;

/** Merges `extras` into the proven bytes, and binds. Each call gives new bytes. */
export function bind(proven: Uint8Array, ...extras: Uint8Array[]): Uint8Array {
  const read = (bytes: Uint8Array) =>
    Transaction.deserialize('signature', 'proof', 'pre-binding', bytes);
  return extras
    .reduce((tx, extra) => read(extra).merge(tx), read(proven))
    .bind()
    .serialize();
}

/** What the sponsor does: merge in a new fee intent, and bind. */
export const sponsorPays = async (proven: Uint8Array, ttlMs?: number): Promise<Uint8Array> =>
  bind(proven, await feeIntent(ttlMs));

/** The identifier that the fee intent adds. */
export const paymentId = (paid: Uint8Array, proven: Uint8Array): string | undefined => {
  const mine = Transaction.deserialize('signature', 'proof', 'pre-binding', proven).identifiers();
  return Transaction.deserialize('signature', 'proof', 'binding', paid)
    .identifiers()
    .find((id) => !mine.includes(id));
};

export const hashOf = (n: number): string => `0x${n.toString(16).padStart(64, '0')}`;

interface Block {
  readonly number: number;
  readonly parent: string;
  readonly extrinsics: readonly string[];
}

export interface ScriptedNode {
  best: string;
  /** Drops that many next calls of each method; `'*'` counts calls of any method. */
  drops: Record<string, number>;
  /** When each submit reached the node, dropped or not. */
  submitTimes: number[];
  refusal: object | undefined;
  /** Runs with each extrinsic that the node takes. */
  onSubmit: ((hex: string) => void) | undefined;
  add(hash: string, extrinsics?: readonly string[], parent?: string): void;
}

/** A scripted node over JSON-RPC. Each block lists the extrinsics that it holds. */
export function fakeNode() {
  const blocks = new Map<string, Block>([
    [hashOf(0), { number: 0, parent: hashOf(0), extrinsics: [] }],
  ]);
  const node: ScriptedNode = {
    best: hashOf(0),
    drops: {},
    submitTimes: [],
    refusal: undefined,
    onSubmit: undefined,
    add(hash, extrinsics = [], parent = node.best) {
      blocks.set(hash, { number: (blocks.get(parent)?.number ?? 0) + 1, parent, extrinsics });
      node.best = hash;
    },
  };
  const platform = createStubPlatform();
  platform.answer(async (request) => {
    const { method, params } = JSON.parse(String(request.body)) as {
      method: string;
      params: string[];
    };
    const answer = (body: object) =>
      respond(200, JSON.stringify({ jsonrpc: '2.0', id: 1, ...body }));
    if (method === 'author_submitExtrinsic') node.submitTimes.push(Date.now());
    for (const key of ['*', method]) {
      if ((node.drops[key] ?? 0) <= 0) continue;
      node.drops[key] = (node.drops[key] ?? 0) - 1;
      throw new Error('connection reset');
    }
    const best = blocks.get(node.best);
    if (method === 'chain_getHeader')
      return answer({ result: { number: `0x${String(best?.number.toString(16))}` } });
    if (method === 'chain_getBlockHash') return answer({ result: node.best });
    if (method === 'chain_getBlock') {
      const block = blocks.get(params[0] ?? '');
      if (!block) return answer({ result: null });
      const header = { number: `0x${block.number.toString(16)}`, parentHash: block.parent };
      return answer({ result: { block: { header, extrinsics: block.extrinsics } } });
    }
    if (node.refusal) return answer({ error: node.refusal });
    node.onSubmit?.(params[0] ?? '');
    return answer({ result: hashOf(99) });
  });
  return { node, platform };
}

export const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
