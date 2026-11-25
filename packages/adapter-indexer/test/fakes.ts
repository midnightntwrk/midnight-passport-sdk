import assert from 'node:assert/strict';
import {
  IndexerUnreachableError,
  type AbortSignalLike,
  type BlockRef,
  type HttpRequest,
  type HttpResponse,
} from '@midnight-ntwrk/mn-passport-core';
import { createStubNode, expectRejection, type StubNode } from '@midnight-ntwrk/mn-passport-dev';

export const INDEXER_URL = 'https://indexer.test/graphql';

export const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
export const response = (status: number, body: Uint8Array): HttpResponse => ({
  status,
  headers: {},
  body,
});
export const ok = (value: unknown): HttpResponse => response(200, encode(JSON.stringify(value)));

export async function rejectsUnreachable(
  run: () => Promise<unknown>,
  reason: IndexerUnreachableError['reason'],
): Promise<void> {
  const error = await expectRejection(run, 'IndexerUnreachableError');
  assert.ok(error instanceof IndexerUnreachableError);
  assert.equal(error.reason, reason);
}

/** The hash is the height in hex, as in the dev stub node. */
export const block = (height: number): BlockRef => ({
  height,
  hash: height.toString(16).padStart(64, '0'),
});

/** The indexer's answer: `state` last changed at block `at`, and the indexer is at `head`. */
export const stateAnswer = (state: string | null, at = 5, head = 9): HttpResponse =>
  ok({
    data: {
      block: block(head),
      contract: state === null ? null : { state, stateAt: block(at) },
    },
  });

export const NODE_URL = 'https://node.test';

/** A node at `height` with `state` at the contract, or with no contract. */
export function nodeWith(state: string | undefined, height: number): StubNode {
  const node = createStubNode();
  while (node.best().height < height) node.addBlock();
  if (state !== undefined) node.on('midnight_contractState', () => ({ result: state }));
  return node;
}

export interface Sent {
  readonly url: string;
  readonly method: string | undefined;
  readonly params: readonly unknown[];
  readonly signal: AbortSignalLike | undefined;
}

type Http = (request: HttpRequest) => Promise<HttpResponse>;

/** Sends each request to the indexer or the node by its URL, and logs it in `sent`. */
export function route(indexer: Http, node: Http, sent: Sent[] = []): Http {
  return (request) => {
    const body = JSON.parse(String(request.body)) as { method?: string; params?: unknown[] };
    sent.push({
      url: request.url,
      method: body.method,
      params: body.params ?? [],
      signal: request.signal,
    });
    if (request.url === INDEXER_URL) return indexer(request);
    assert.equal(request.url, NODE_URL);
    return node(request);
  };
}
