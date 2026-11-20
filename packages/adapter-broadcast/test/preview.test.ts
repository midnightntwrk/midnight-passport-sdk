import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CancelledError,
  NetworkError,
  createSender,
  type LocalStore,
  type Platform,
} from '@midnight-ntwrk/mn-passport-core';
import { nodeBroadcast, sponsorFees } from '@midnight-ntwrk/mn-passport-adapter-broadcast';
import { createStubChain, createStubIndexer } from '@midnight-ntwrk/mn-passport-dev';
import { extrinsicHex } from '../dist/extrinsic.js';

const NODE = process.env.MN_PREVIEW_NODE_URL;
const SPONSOR = process.env.MN_PREVIEW_SPONSOR_URL;
// The path of a file with the hex of a fresh proven call, made just before the run.
const PROVEN = process.env.MN_PREVIEW_PROVEN_TX;
const skip =
  NODE && SPONSOR && PROVEN
    ? false
    : 'set MN_PREVIEW_NODE_URL, MN_PREVIEW_SPONSOR_URL, and MN_PREVIEW_PROVEN_TX';

const platform: Platform = {
  async http(request) {
    try {
      const response = await fetch(request.url, {
        method: request.method,
        ...(request.headers ? { headers: request.headers } : {}),
        ...(request.body === undefined ? {} : { body: request.body }),
        ...(request.signal ? { signal: request.signal as AbortSignal } : {}),
        redirect: 'manual',
      });
      if (response.status >= 300 && response.status < 400) throw new NetworkError();
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => (headers[key] = value));
      return {
        status: response.status,
        headers,
        body: new Uint8Array(await response.arrayBuffer()),
      };
    } catch (error) {
      if (request.signal?.aborted) throw new CancelledError('caller');
      throw error instanceof NetworkError ? error : new NetworkError();
    }
  },
  randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
  loadRuntimes: async () => {},
  store: {} as LocalStore,
  webauthn: undefined,
};

// "Final" needs the indexer adapter, so this run stops at `in-block`.
const noIndexer = createStubIndexer(createStubChain());

test(
  'a client with no NIGHT and no DUST lands a call on Preview',
  { skip, timeout: 300_000 },
  async (t) => {
    assert.ok(NODE && SPONSOR && PROVEN);
    const bytes = Uint8Array.from(Buffer.from((await readFile(PROVEN, 'utf8')).trim(), 'hex'));
    let paid: Uint8Array | undefined;
    const fees = sponsorFees({ url: SPONSOR, platform });
    const sender = createSender({
      fees: {
        pay: async (tx, options) => {
          const result = await fees.pay(tx, options);
          paid = result.bytes;
          return result;
        },
      },
      broadcast: nodeBroadcast({ url: NODE, platform, indexer: noIndexer }),
      indexer: noIndexer,
    });
    const status = await sender.send(async () => ({ stage: 'proven', bytes }), {
      account: 'preview',
      until: 'in-block',
      timeoutMs: 120_000,
    });
    assert.equal(status.level, 'in-block');
    t.diagnostic(`in block ${status.block.height}, id ${status.id}`);

    // The same bytes again give a node error, so the run records its raw shape.
    assert.ok(paid);
    const answer = await platform.http({
      url: NODE,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'author_submitExtrinsic',
        params: [extrinsicHex(paid, [0x05, 0x00])],
      }),
    });
    const { error } = JSON.parse(new TextDecoder().decode(answer.body)) as {
      error?: { code?: unknown; message?: unknown; data?: unknown };
    };
    t.diagnostic(`raw error: ${JSON.stringify({ ...error, data: typeof error?.data })}`);
    assert.equal(typeof error?.code, 'number');
    assert.equal(typeof error?.message, 'string');
  },
);
