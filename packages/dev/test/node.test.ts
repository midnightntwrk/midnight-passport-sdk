import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStubNode, type StubNode } from '@midnight-ntwrk/mn-passport-dev';

const call = async (node: StubNode, method: string, params: unknown[] = []): Promise<unknown> => {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 3, method, params });
  const response = await node.http({ url: 'https://node.test', method: 'POST', body });
  return JSON.parse(new TextDecoder().decode(response.body));
};

test('the stub node answers block hashes and headers in the wire form of the node', async () => {
  const node = createStubNode();
  const first = node.addBlock();
  const second = node.addBlock();
  assert.deepEqual(node.best(), second);
  assert.deepEqual(await call(node, 'chain_getBlockHash'), {
    jsonrpc: '2.0',
    id: 3,
    result: `0x${second.hash}`,
  });
  assert.deepEqual(await call(node, 'chain_getBlockHash', [1]), {
    jsonrpc: '2.0',
    id: 3,
    result: `0x${first.hash}`,
  });
  assert.deepEqual(await call(node, 'chain_getHeader', [`0x${second.hash}`]), {
    jsonrpc: '2.0',
    id: 3,
    result: { number: '0x2', parentHash: `0x${first.hash}` },
  });
});

test('the stub node gives null for an unknown block, and an error for an unknown method', async () => {
  const node = createStubNode();
  assert.equal(((await call(node, 'chain_getBlockHash', [5])) as { result: unknown }).result, null);
  assert.equal(
    ((await call(node, 'chain_getHeader', ['0x01'])) as { result: unknown }).result,
    null,
  );
  assert.equal(
    ((await call(node, 'author_submitExtrinsic', ['0x00'])) as { error: { code: number } }).error
      .code,
    -32601,
  );
  node.on('author_submitExtrinsic', ([hex]) => ({ result: hex }));
  assert.deepEqual(await call(node, 'author_submitExtrinsic', ['0x00']), {
    jsonrpc: '2.0',
    id: 3,
    result: '0x00',
  });
});
