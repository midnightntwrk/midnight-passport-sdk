import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { HttpRequest, HttpResponse } from '@midnight-ntwrk/mn-passport-core';
import {
  ContractCallPrototype,
  ContractOperation,
  Intent,
  Proof,
  Transaction,
  communicationCommitmentRandomness,
  sampleContractAddress,
} from '@midnightntwrk/ledger-v9';

/** The verifier key of `owner_call` in `fixtures/owner-call.compact`, compiled with Compact 0.36.1. */
export const verifierKey = new Uint8Array(
  readFileSync(new URL('../test/fixtures/owner_call.verifier', import.meta.url)),
);
export const verifierKeyHash = createHash('sha256').update(verifierKey).digest('hex');

export interface OneCall {
  readonly bytes: Uint8Array;
  readonly address: string;
  readonly location: string;
}

/**
 * An unproven transaction with one call to `entryPoint`, labelled `label` (by default its
 * real location), and a second call to `also` if given.
 */
export function oneCall(
  options: { entryPoint?: string; label?: (address: string) => string; also?: string } = {},
): OneCall {
  const op = new ContractOperation();
  op.verifierKey = verifierKey;
  const address = sampleContractAddress();
  const entryPoint = options.entryPoint ?? 'owner_call';
  const location = `contract:${address}/${entryPoint}?vk=${verifierKeyHash}`;
  const empty = { value: [], alignment: [] };
  const call = new ContractCallPrototype(
    address,
    entryPoint,
    op,
    undefined,
    undefined,
    [],
    empty,
    empty,
    communicationCommitmentRandomness(),
    options.label?.(address) ?? location,
  );
  let intent = Intent.new(new Date(Date.now() + 3_600_000)).addCall(call);
  if (options.also !== undefined) {
    const other = sampleContractAddress();
    const second = new ContractCallPrototype(
      other,
      options.also,
      op,
      undefined,
      undefined,
      [],
      empty,
      empty,
      communicationCommitmentRandomness(),
      `contract:${other}/${options.also}?vk=${verifierKeyHash}`,
    );
    intent = intent.addCall(second);
  }
  const bytes = Transaction.fromParts('undeployed', undefined, undefined, intent).serialize();
  return { bytes, address, location };
}

const header = (tag: string): Uint8Array => new TextEncoder().encode(tag);

/** Answers `/check` with no values and `/prove` with an empty proof, which the ledger accepts. */
export async function fakeService(request: HttpRequest): Promise<HttpResponse> {
  const body = request.url.includes('/check?')
    ? Uint8Array.of(...header('midnight:vec(option(u64)):'), 0)
    : new Proof('0100').serialize();
  return { status: 200, headers: {}, body };
}
