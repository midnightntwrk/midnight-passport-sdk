import {
  NetworkError,
  type HttpResponse,
  type ProvenTransaction,
} from '@midnight-ntwrk/mn-passport-core';
import type { HttpHandler } from '@midnight-ntwrk/mn-passport-dev';
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

export const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
