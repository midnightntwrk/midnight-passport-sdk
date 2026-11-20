import {
  nodeRefusal,
  type AbortSignalLike,
  type NodeRefusedError,
  type PaidTransaction,
  type Platform,
} from '@midnight-ntwrk/mn-passport-core';
import { extrinsicHex, type CallIndex } from './extrinsic.js';
import { field, json, send } from './request.js';

// A JSON-RPC value comes from the network, so callers check its shape.
export type RpcAnswer =
  | { readonly kind: 'result'; readonly result: unknown }
  | { readonly kind: 'error'; readonly error: unknown }
  | { readonly kind: 'failed' };

export interface NodeClient {
  /** An abort rejects with `CancelledError`. Every other failure is `failed`. */
  call(
    method: string,
    params: readonly string[],
    signal: AbortSignalLike | undefined,
  ): Promise<RpcAnswer>;
}

const FAILED: RpcAnswer = { kind: 'failed' };

export function createNodeClient(platform: Platform, url: string, timeoutMs: number): NodeClient {
  let id = 0;
  return {
    async call(method, params, signal) {
      const answer = await send(
        platform,
        {
          url,
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
        },
        signal,
        timeoutMs,
      );
      if (!answer.ok) return FAILED;
      const body = json(answer.response.body);
      // A gateway can answer JSON that is not JSON-RPC; that is no node answer.
      if (field(body, 'jsonrpc') !== '2.0') return FAILED;
      const error = field(body, 'error');
      const code = field(error, 'code');
      // -32768 to -32000 are JSON-RPC transport and server errors, for example from a gateway.
      if (typeof code === 'number' && code >= -32_768 && code <= -32_000) return FAILED;
      if (error !== undefined && error !== null) return { kind: 'error', error };
      const result = field(body, 'result');
      // `null` is a real result, for example no block at a height.
      return answer.response.status === 200 && result !== undefined
        ? { kind: 'result', result }
        : FAILED;
    },
  };
}

/**
 * `nodeRefusal` reads the node codes from the joined form `<code>: <message>: <data>`.
 * For an error with another shape, it reads the error as joined text.
 */
function refusalMessage(error: unknown): string {
  const code = field(error, 'code');
  const message = field(error, 'message');
  if (typeof code !== 'number' || typeof message !== 'string') {
    return typeof error === 'string' ? error : JSON.stringify(error);
  }
  const data = field(error, 'data');
  if (data === undefined) return `${code}: ${message}`;
  return `${code}: ${message}: ${typeof data === 'string' ? data : JSON.stringify(data)}`;
}

export type SubmitOutcome =
  | { readonly kind: 'accepted' }
  | { readonly kind: 'refused'; readonly error: NodeRefusedError }
  | { readonly kind: 'failed' };

/** One send. "Already imported" is `accepted`. */
export async function submitOnce(
  node: NodeClient,
  tx: PaidTransaction,
  callIndex: CallIndex,
  signal: AbortSignalLike | undefined,
): Promise<SubmitOutcome> {
  const answer = await node.call(
    'author_submitExtrinsic',
    [extrinsicHex(tx.bytes, callIndex)],
    signal,
  );
  if (answer.kind === 'result') return { kind: 'accepted' };
  if (answer.kind === 'failed') return answer;
  const error = nodeRefusal([refusalMessage(answer.error)]);
  return error ? { kind: 'refused', error } : { kind: 'accepted' };
}
