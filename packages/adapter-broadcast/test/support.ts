import {
  NetworkError,
  type HttpResponse,
  type ProvenTransaction,
} from '@midnight-ntwrk/mn-passport-core';
import type { HttpHandler } from '@midnight-ntwrk/mn-passport-dev';
import { CostModel, Intent, Transaction } from '@midnightntwrk/ledger-v9';

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

/** A real proven, unbound transaction with one intent and no contract call. */
export async function provenTx(): Promise<ProvenTransaction> {
  const unproven = Transaction.fromParts(
    'undeployed',
    undefined,
    undefined,
    Intent.new(new Date(Date.now() + 600_000)),
  );
  const proven = await unproven.prove(
    { check: refuse, lookupKey: refuse, prove: refuse },
    CostModel.initialCostModel(),
  );
  return { stage: 'proven', bytes: proven.serialize() };
}

/** What the sponsor does to the proven bytes, less the DUST spend: bind them. Each call gives new bytes. */
export function bind(proven: Uint8Array): Uint8Array {
  return Transaction.deserialize('signature', 'proof', 'pre-binding', proven).bind().serialize();
}

export const lastId = (paid: Uint8Array): string | undefined =>
  Transaction.deserialize('signature', 'proof', 'binding', paid).identifiers().at(-1);

export const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
