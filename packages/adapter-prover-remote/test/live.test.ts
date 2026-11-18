import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { remoteProver } from '@midnight-ntwrk/mn-passport-adapter-prover-remote';
import { nodePlatform } from './node-platform.js';
import { startProxy } from './proxy.js';

// The fixture is a compiler output folder (`keys/`, `zkir/`) with a `calls.json`:
// [{ "kind": "activation", "tx": "activate.tx", "circuitIds": ["..."] }, { "kind": "owner-call", … }].
// Each `tx` holds the bytes of a `Transaction<signature, pre-proof, pre-binding>`.
export interface FixtureCall {
  readonly kind: 'activation' | 'owner-call';
  readonly tx: string;
  readonly circuitIds: readonly string[];
}

const fixture = process.env.PASSPORT_PROVER_FIXTURE;
const localUrl = process.env.PASSPORT_PROVER_LOCAL_URL;
const hostedUrl = process.env.PASSPORT_PROVER_URL;
const hostedToken = process.env.PASSPORT_PROVER_TOKEN;

async function proveAll(url: string, credential?: string): Promise<void> {
  assert.ok(fixture);
  const calls = JSON.parse(await readFile(join(fixture, 'calls.json'), 'utf8')) as FixtureCall[];
  assert.deepEqual([...new Set(calls.map((call) => call.kind))].sort(), [
    'activation',
    'owner-call',
  ]);
  for (const call of calls) {
    const platform = nodePlatform();
    const prover = remoteProver({
      url,
      platform,
      verifierKey: async ({ circuitId }) =>
        new Uint8Array(await readFile(join(fixture, 'keys', `${circuitId}.verifier`))),
      ...(credential ? { credential: async () => credential } : {}),
    });
    const bytes = new Uint8Array(await readFile(join(fixture, call.tx)));
    const proven = await prover.prove({ stage: 'unproven', bytes }, call.circuitIds);
    assert.equal(proven.stage, 'proven', call.kind);
    const total = platform.sizes.reduce((sum, size) => sum + size, 0);
    assert.ok(total < 10_000, `${call.kind}: ${total} bytes on the wire`);
    assert.ok(
      platform.requests.every((request) => request.method === 'POST'),
      `${call.kind}: a request that is not a POST`,
    );
    assert.ok(
      platform.requests.every((request) => (request.body?.length ?? 0) <= 64_000),
      `${call.kind}: a body over 64 KB`,
    );
  }
}

test(
  'the fixture calls prove through the test proxy and a local proof server',
  {
    skip: !(fixture && localUrl) && 'needs PASSPORT_PROVER_FIXTURE and PASSPORT_PROVER_LOCAL_URL',
    // A local p256 proof takes about a minute; each fixture call proves in turn.
    timeout: 900_000,
  },
  async () => {
    assert.ok(fixture && localUrl);
    const proxy = await startProxy({ dir: fixture, upstream: localUrl });
    try {
      await proveAll(proxy.url);
    } finally {
      await proxy.close();
    }
  },
);

test(
  'the fixture calls prove on the hosted prover',
  {
    skip:
      !(fixture && hostedUrl && hostedToken) &&
      'needs PASSPORT_PROVER_FIXTURE, PASSPORT_PROVER_URL, and PASSPORT_PROVER_TOKEN',
    timeout: 900_000,
  },
  async () => {
    assert.ok(hostedUrl && hostedToken);
    await proveAll(hostedUrl, hostedToken);
  },
);
