import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSender } from '../packages/core/dist/index.js';
import { createStubChain, createStubIndexer } from '../packages/dev/dist/index.js';
import { nodeBroadcast, sponsorFees } from '../packages/adapter-broadcast/dist/index.js';
import {
  fakeNode,
  hex,
  provenTx,
  respond,
  sponsorPays,
} from '../packages/adapter-broadcast/dist-test/support.js';
import { parseJson } from '../scripts/json.mjs';

const SPONSOR = 'https://sponsor.example/api/midnight/sponsor';
const NODE = 'https://node.example';

const noIndexer = createStubIndexer(createStubChain());

/**
 * The real sponsor and node adapters over a fake sponsor and a fake node.
 * @param {{ busyFirst?: boolean, refuseFirst?: boolean }} [script]
 */
function world({ busyFirst = false, refuseFirst = false } = {}) {
  const { node, platform: nodePlatform } = fakeNode();
  if (refuseFirst) {
    node.refusal = { code: 1010, message: 'Invalid Transaction', data: 'Custom error: 170' };
  }
  let blocks = 0;
  node.onSubmit = (extrinsic) =>
    node.add(`0x${(++blocks).toString(16).padStart(64, '0')}`, [extrinsic]);
  const w = { submitted: /** @type {string[]} */ ([]), sponsorCalls: 0, hangHeader: false };
  const platform = {
    ...nodePlatform,
    /** @param {import('../packages/core/dist/index.js').HttpRequest} request */
    async http(request) {
      if (request.url === SPONSOR) {
        // The first sponsor answer can be busy, from the recorded 503 with a wait of zero.
        if (++w.sponsorCalls === 1 && busyFirst) return respond(503, '{}', { 'retry-after': '0' });
        const { provenTx } = /** @type {{ provenTx: string }} */ (parseJson(String(request.body)));
        const paid = await sponsorPays(Uint8Array.from(Buffer.from(provenTx, 'hex')));
        return respond(200, JSON.stringify({ tx: hex(paid) }));
      }
      const body = /** @type {{ method: string, params: [string] }} */ (
        parseJson(String(request.body))
      );
      if (body.method === 'chain_getHeader' && w.hangHeader) {
        /** @type {Promise<never>} */
        const hung = new Promise(() => {});
        return hung;
      }
      if (body.method !== 'author_submitExtrinsic') return nodePlatform.http(request);
      w.submitted.push(body.params[0]);
      const answer = await nodePlatform.http(request);
      node.refusal = undefined;
      return answer;
    },
  };
  const sender = createSender(
    {
      fees: sponsorFees({ url: SPONSOR, platform }),
      broadcast: nodeBroadcast({ url: NODE, platform, indexer: noIndexer, pollMs: 1 }),
      indexer: noIndexer,
    },
    { lostWaitMs: 50 },
  );
  return Object.assign(w, { sender });
}

const options = { account: 'aa', until: /** @type {const} */ ('in-block'), timeoutMs: 2_000 };

test(
  'a node refusal gets a new payment, and no paid bytes go to the node twice',
  { timeout: 10_000 },
  async () => {
    const tx = await provenTx();
    const w = world({ busyFirst: true, refuseFirst: true });
    let builds = 0;
    const status = await w.sender.send(async () => (builds++, tx), options);
    assert.equal(status.level, 'in-block');
    assert.equal(builds, 1);
    assert.equal(w.sponsorCalls, 3);
    assert.equal(w.submitted.length, 2);
    assert.equal(new Set(w.submitted).size, 2);
  },
);

test(
  'an abort before the send gives the id, and a queued retry sends the action once',
  { timeout: 10_000 },
  async () => {
    const tx = await provenTx();
    const w = world();
    w.hangHeader = true;
    const controller = new AbortController();
    const first = w.sender.send(async () => tx, { ...options, signal: controller.signal });
    const retry = w.sender.send(async () => tx, options);
    setTimeout(() => {
      controller.abort();
      w.hangHeader = false;
    }, 10);
    // The loop cannot tell that the bytes never left, so it calls the send uncertain.
    await assert.rejects(
      first,
      (/** @type {{ _tag?: string, id?: string }} */ e) =>
        e._tag === 'SendUncertainError' && typeof e.id === 'string',
    );
    assert.equal((await retry).level, 'in-block');
    assert.equal(w.submitted.length, 1);
  },
);
