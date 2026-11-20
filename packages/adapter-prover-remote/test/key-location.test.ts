import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProverRejectedError } from '../dist/errors.js';
import { parseKeyLocation } from '../dist/key-location.js';

const address = 'aB'.repeat(32);
const vk = '0f'.repeat(32);

test('a contract location gives its lowercase address, circuit, and verifier key hash', () => {
  assert.deepEqual(parseKeyLocation(`contract:${address}/owner_call?vk=${vk}`), {
    kind: 'contract',
    contractAddress: address.toLowerCase(),
    circuitId: 'owner_call',
    verifierKeyHash: vk,
  });
});

test('the three built-in locations pass as they are', () => {
  for (const location of ['midnight/zswap/spend', 'midnight/zswap/output', 'midnight/dust/spend']) {
    assert.deepEqual(parseKeyLocation(location), { kind: 'builtin', location });
  }
});

test('a bare circuit name or a malformed location rejects as input', () => {
  const bad = [
    'owner_call',
    '',
    'midnight/',
    'midnight/../keys',
    'midnight//spend',
    'midnight/x',
    'midnight/zswap/sign',
    `contract:${address}/owner_call`,
    `contract:${address}/owner_call?vk=${vk.toUpperCase()}`,
    `contract:${address.slice(2)}/owner_call?vk=${vk}`,
    `contract:${address}/../owner?vk=${vk}`,
    `contract:${address}/owner-call?vk=${vk}`,
    `contract:${address}/owner_call?vk=${vk}&x=1`,
    ` contract:${address}/owner_call?vk=${vk}`,
    `contract:${address}/owner_call?vk=${vk}\n`,
    'midnight/zswap/spend\n',
  ];
  for (const location of bad) {
    assert.throws(
      () => parseKeyLocation(location),
      (error: unknown) =>
        error instanceof ProverRejectedError &&
        error.reason === 'input' &&
        error.status === undefined,
      location,
    );
  }
});
