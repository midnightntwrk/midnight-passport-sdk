import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIndexer } from '@midnight-ntwrk/mn-passport-adapter-indexer';
import { http } from './preview.js';

// `MN_LOCAL_CONTRACT` is a deployed contract on the local network.
const url = process.env.MN_LOCAL_INDEXER_URL ?? '';
const contract = process.env.MN_LOCAL_CONTRACT ?? '';
const skip = (url === '' || contract === '') && 'set MN_LOCAL_INDEXER_URL, MN_LOCAL_CONTRACT';

const indexer = () => createIndexer({ indexerUrl: url, http, requestTimeoutMs: 30_000 });

/** The ledger's tagged encoding starts with `midnight:<name>[v<n>]:`. */
const tagged = (bytes: Uint8Array, name: string): boolean =>
  Buffer.from(bytes.subarray(0, 64)).toString('latin1').startsWith(`midnight:${name}[v`);

test(
  'local network: the call inputs are ledger encodings of one block',
  { skip, timeout: 60_000 },
  async () => {
    const reads = indexer();
    const inputs = await reads.callInputs(contract);
    assert.ok(inputs, `no contract at ${contract}`);
    assert.ok(tagged(inputs.ledgerParameters, 'ledger-parameters'));
    assert.ok(tagged(inputs.zswapChainState, 'zswap-ledger-state'));
    assert.ok(tagged(inputs.state.bytes, 'contract-state'));
    assert.ok(inputs.state.block.height <= inputs.block.height);
    assert.ok(tagged((await reads.ledgerParameters()).bytes, 'ledger-parameters'));
  },
);

test(
  'local network: the genesis block has the Zswap events of its first outputs',
  { skip, timeout: 60_000 },
  async () => {
    const answer = await http({
      url,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ block(offset: { height: 0 }) { hash } }' }),
    });
    const { data } = JSON.parse(new TextDecoder().decode(answer.body)) as {
      data: { block: { hash: string } };
    };
    const events = await indexer().zswapEvents({ height: 0, hash: data.block.hash });
    assert.ok(events && events.length > 0, 'the genesis block has no Zswap events');
    assert.ok(events.every((event) => tagged(event, 'event')));
  },
);
