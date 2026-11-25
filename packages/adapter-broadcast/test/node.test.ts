import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NodeRefusedError, PaidTransaction } from '@midnight-ntwrk/mn-passport-core';
import { createStubPlatform } from '@midnight-ntwrk/mn-passport-dev';
import { extrinsicHex } from '../dist/extrinsic.js';
import { createNodeClient, submitOnce, type SubmitOutcome } from '../dist/node.js';
import { ALREADY_IMPORTED, NODE_REFUSALS } from './fixtures/node-answers.js';
import { hex, never, offline, respond } from './support.js';

const URL = 'https://node.example';
const CALL = [0x05, 0x00] as const;

const paid = (bytes: Uint8Array): PaidTransaction => ({
  stage: 'paid',
  bytes,
  id: '00'.repeat(33),
  submitBy: undefined,
});

function setup(timeoutMs = 1_000) {
  const platform = createStubPlatform();
  return { platform, node: createNodeClient(platform, URL, timeoutMs) };
}

const rpcAnswer = (body: object) =>
  respond(200, JSON.stringify({ jsonrpc: '2.0', id: 1, ...body }));

const refused = (outcome: SubmitOutcome): NodeRefusedError => {
  assert.equal(outcome.kind, 'refused');
  return (outcome as { error: NodeRefusedError }).error;
};

test('the extrinsic is unsigned version 4 with the call index and a compact length', () => {
  assert.equal(extrinsicHex(Uint8Array.of(0xaa, 0xbb), CALL), '0x1804050008aabb');
  for (const [length, prefix] of [
    [63, 'fc'],
    [64, '0101'],
    [16_383, 'fdff'],
    [16_384, '02000100'],
  ] as const) {
    const text = extrinsicHex(new Uint8Array(length), [0x07, 0x01]);
    assert.ok(text.includes(`040701${prefix}${'00'.repeat(length)}`), `length ${length}`);
  }
});

test('submit posts author_submitExtrinsic with the extrinsic hex', async () => {
  const { platform, node } = setup();
  platform.answer(async () => rpcAnswer({ result: `0x${'11'.repeat(32)}` }));
  const bytes = Uint8Array.of(1, 2, 3);
  assert.deepEqual(await submitOnce(node, paid(bytes), CALL, undefined), { kind: 'accepted' });
  const request = platform.requests[0];
  assert.equal(request?.url, URL);
  assert.equal(request?.method, 'POST');
  const body = JSON.parse(String(request?.body)) as {
    jsonrpc: string;
    method: string;
    params: unknown;
  };
  assert.equal(body.jsonrpc, '2.0');
  assert.equal(body.method, 'author_submitExtrinsic');
  assert.deepEqual(body.params, [extrinsicHex(bytes, CALL)]);
});

test('"already imported", in either shape, and a null result are accepted', async () => {
  for (const body of [
    { error: ALREADY_IMPORTED },
    { error: '1013: Transaction Already Imported: Any { .. }' },
    { result: null },
  ]) {
    const { platform, node } = setup();
    platform.answer(async () => rpcAnswer(body));
    const outcome = await submitOnce(node, paid(Uint8Array.of(1)), CALL, undefined);
    assert.deepEqual(outcome, { kind: 'accepted' }, JSON.stringify(body));
  }
});

for (const [name, error, expected] of NODE_REFUSALS) {
  test(`a node answer, ${name}, gives ${expected.reason} (${expected.action})`, async () => {
    const { platform, node } = setup();
    platform.answer(async () => rpcAnswer({ error }));
    const refusal = refused(await submitOnce(node, paid(Uint8Array.of(1)), CALL, undefined));
    assert.equal(refusal._tag, 'NodeRefusedError');
    assert.equal(refusal.reason, expected.reason);
    assert.equal(refusal.action, expected.action);
    assert.equal(refusal.newProof, expected.newProof);
    assert.equal(refusal.nodeCode, expected.nodeCode);
  });
}

test('an HTTP error with a JSON-RPC error body is still read', async () => {
  const { platform, node } = setup();
  platform.answer(async () =>
    respond(
      500,
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: 1010, message: 'Invalid Transaction', data: 'Custom error: 228' },
      }),
    ),
  );
  const refusal = refused(await submitOnce(node, paid(Uint8Array.of(1)), CALL, undefined));
  assert.equal(refusal.nodeCode, 228);
});

test('no answer, a bad body, or no result is failed, not a refusal', async () => {
  for (const handler of [
    offline,
    never,
    async () => respond(200, 'not json'),
    async () => respond(502, '<html>Bad Gateway</html>'),
    async () => rpcAnswer({}),
    async () => rpcAnswer({ error: { code: -32603, message: 'Internal error' } }),
    // A gateway's own JSON error is no node answer.
    async () =>
      respond(503, JSON.stringify({ error: { code: 1010, message: 'Custom error: 228' } })),
  ]) {
    const { platform, node } = setup(20);
    platform.answer(handler);
    assert.deepEqual(await submitOnce(node, paid(Uint8Array.of(1)), CALL, undefined), {
      kind: 'failed',
    });
  }
});

test('a refusal holds no node text and no transaction bytes', async () => {
  const { platform, node } = setup();
  const tx = paid(new Uint8Array(64).fill(0xab));
  const secret = hex(tx.bytes);
  platform.answer(async () =>
    rpcAnswer({
      error: {
        code: 1010,
        message: `Invalid Transaction ${secret}`,
        data: `Custom error: 170 ${secret}`,
      },
    }),
  );
  const refusal = refused(await submitOnce(node, tx, CALL, undefined));
  const seen = [
    refusal.message,
    refusal.stack ?? '',
    JSON.stringify(refusal),
    ...(Object.values(refusal) as unknown[]),
  ]
    .map(String)
    .join('\n');
  assert.ok(!seen.includes(secret));
  assert.equal(refusal.nodeCode, 170);
});
