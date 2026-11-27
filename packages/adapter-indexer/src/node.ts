import {
  CancelledError,
  type BlockRef,
  type CallOptions,
  type ContractAddress,
} from '@midnight-ntwrk/mn-passport-core';
import { clearTimer, setTimer } from './globals.js';
import { decodeHex } from './hex.js';
import { isRecord, ownSignal, postJson, type Endpoint } from './transport.js';

export interface NodeStateRead {
  /** The block that the read was pinned to. It can still be reverted. */
  readonly block: BlockRef;
  readonly bytes: Uint8Array;
}

const PREFIXED_HASH = /^0x[0-9a-fA-F]{64}$/;
const PREFIXED_NUMBER = /^0x[0-9a-fA-F]{1,13}$/;

class NoAnswer extends Error {}

async function call(
  endpoint: Endpoint,
  method: string,
  params: readonly unknown[],
  options?: CallOptions,
): Promise<unknown> {
  const body = await postJson(endpoint, { jsonrpc: '2.0', id: 1, method, params }, options);
  if ('error' in body || !('result' in body)) throw new NoAnswer();
  return body.result;
}

function parseHeight(header: unknown): number {
  const number = isRecord(header) ? header.number : undefined;
  if (typeof number !== 'string' || !PREFIXED_NUMBER.test(number)) throw new NoAnswer();
  return parseInt(number.slice(2), 16);
}

/**
 * Reads at the best block. Every node failure gives `undefined`, "no contract" and the end of
 * `timeoutMs` for the whole read too. Only a caller abort rejects.
 */
export async function readNodeState(
  endpoint: Endpoint,
  address: ContractAddress,
  options?: CallOptions,
): Promise<NodeStateRead | undefined> {
  // One deadline for all calls, so a slow node cannot hold the indexer's answer for long.
  const read = ownSignal(options?.signal);
  const deadline = setTimer(read.abort, endpoint.timeoutMs);
  const signal = { signal: read.signal };
  try {
    const hash = await call(endpoint, 'chain_getBlockHash', [], signal);
    if (typeof hash !== 'string' || !PREFIXED_HASH.test(hash)) throw new NoAnswer();
    // The best block can move between two calls, so both name the same hash.
    const [header, state] = await Promise.all([
      call(endpoint, 'chain_getHeader', [hash], signal),
      call(endpoint, 'midnight_contractState', [address, hash], signal),
    ]);
    const bytes = decodeHex(state);
    if (bytes === undefined) throw new NoAnswer();
    return { block: { height: parseHeight(header), hash: hash.slice(2).toLowerCase() }, bytes };
  } catch (error) {
    if (error instanceof CancelledError && options?.signal?.aborted) throw error;
    return undefined;
  } finally {
    clearTimer(deadline);
    read.abort();
    read.dispose();
  }
}
