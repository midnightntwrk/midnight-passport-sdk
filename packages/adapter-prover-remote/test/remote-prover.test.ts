import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CostModel, Proof, Transaction } from '@midnightntwrk/ledger-v9';
import { remoteProver } from '@midnight-ntwrk/mn-passport-adapter-prover-remote';
import { createStubPlatform, type HttpHandler } from '@midnight-ntwrk/mn-passport-dev';
import { fakeService, oneCall, verifierKey } from './one-call.js';

const prover = () =>
  remoteProver({
    url: 'https://prover.example',
    platform: createStubPlatform(),
    verifierKey: async () => verifierKey,
  });

test('bytes that are not an unproven transaction reject as input', async () => {
  await assert.rejects(prover().prove({ stage: 'unproven', bytes: Uint8Array.of(1, 2, 3) }, []), {
    _tag: 'ProverRejectedError',
    reason: 'input',
    status: undefined,
  });
});

test('the factory refuses a bad URL with TypeError and a bad default timeout with RangeError', () => {
  const make = (url: string, defaultTimeoutMs?: number) => () =>
    remoteProver({
      url,
      platform: createStubPlatform(),
      verifierKey: async () => verifierKey,
      ...(defaultTimeoutMs === undefined ? {} : { defaultTimeoutMs }),
    });
  assert.throws(make('http://prover.example'), TypeError);
  assert.throws(make('https://prover.example', Infinity), RangeError);
  assert.doesNotThrow(make('https://prover.example', 1000));
});

function recorded(answer: HttpHandler = fakeService, key: Uint8Array = verifierKey) {
  const platform = createStubPlatform({ http: answer });
  let keyFetches = 0;
  const prover = remoteProver({
    url: 'https://prover.example',
    platform,
    verifierKey: async () => (keyFetches++, key),
    credential: async () => 'token',
  });
  return { prover, requests: platform.requests, keyFetches: () => keyFetches };
}

test('a contract call is checked and proven through the service with the credential', async () => {
  const { bytes, location } = oneCall();
  // The ledger itself gives the preimages and the binding input of this call.
  const expected: [string, Uint8Array, bigint | undefined][] = [];
  await Transaction.deserialize('signature', 'pre-proof', 'pre-binding', bytes).prove(
    {
      check: async (preimage) => (expected.push(['check', preimage, undefined]), []),
      lookupKey: async () => ({ proverKey: new Uint8Array(), verifierKey, ir: new Uint8Array() }),
      prove: async (preimage, _location, binding) => {
        expected.push(['prove', preimage, binding]);
        return new Proof('0100').serialize();
      },
    },
    CostModel.initialCostModel(),
  );
  const { prover, requests, keyFetches } = recorded();
  const proven = await prover.prove({ stage: 'unproven', bytes }, ['owner_call']);
  assert.ok(Transaction.deserialize('signature', 'proof', 'pre-binding', proven.bytes));
  // The check, the key lookup, and the proof share one fetch of the verifier key.
  assert.equal(keyFetches(), 1);
  const key = encodeURIComponent(location);
  assert.deepEqual(
    requests.map((request) => [request.url, request.body]),
    expected.map(([route, preimage, binding]) => [
      `https://prover.example/${route}?key=${key}${binding === undefined ? '' : `&binding=${binding}`}`,
      preimage,
    ]),
  );
  for (const request of requests) {
    assert.equal(request.headers?.authorization, 'Bearer token');
    // The call closes when it settles, so no request stays in flight.
    assert.equal(request.signal?.aborted, true);
  }
});

test('a typed rejection of the service reaches the caller through the ledger', async () => {
  const { prover } = recorded(async (request) =>
    request.url.includes('/prove?')
      ? { status: 404, headers: {}, body: new Uint8Array() }
      : fakeService(request),
  );
  await assert.rejects(
    prover.prove({ stage: 'unproven', bytes: oneCall().bytes }, ['owner_call']),
    {
      _tag: 'ProverRejectedError',
      reason: 'unknown-key',
      status: 404,
    },
  );
});

test('a check answer the ledger cannot read rejects as an upstream error', async () => {
  const { prover } = recorded(async (request) =>
    request.url.includes('/check?')
      ? { status: 200, headers: {}, body: Uint8Array.of(1, 2, 3) }
      : fakeService(request),
  );
  await assert.rejects(
    prover.prove({ stage: 'unproven', bytes: oneCall().bytes }, ['owner_call']),
    { _tag: 'UpstreamError', sourceTag: 'parseCheckResult' },
  );
});

test('an undeclared call, a false label, or a wrong verifier key sends no request', async () => {
  const cases = [
    [oneCall({ entryPoint: 'other' }), verifierKey, 'undeclared-circuit'],
    [oneCall({ also: 'other' }), verifierKey, 'undeclared-circuit'],
    [oneCall({ label: () => 'midnight/x' }), verifierKey, 'input'],
    [oneCall({ label: () => 'midnight/zswap/spend' }), verifierKey, 'input'],
    [
      oneCall({ label: () => `contract:${'ef'.repeat(32)}/owner_call?vk=${'0'.repeat(64)}` }),
      verifierKey,
      'undeclared-circuit',
    ],
    [oneCall(), Uint8Array.of(8), 'verifier-key-mismatch'],
  ] as const;
  for (const [{ bytes }, key, reason] of cases) {
    const { prover, requests } = recorded(fakeService, key);
    await assert.rejects(prover.prove({ stage: 'unproven', bytes }, ['owner_call']), { reason });
    assert.deepEqual(requests, [], reason);
  }
});

test('a rejection of the verifierKey callback reaches the caller unchanged', async () => {
  const failure = new Error('artifact missing');
  const prover = remoteProver({
    url: 'https://prover.example',
    platform: createStubPlatform({ http: fakeService }),
    verifierKey: () => Promise.reject(failure),
  });
  await assert.rejects(
    prover.prove({ stage: 'unproven', bytes: oneCall().bytes }, ['owner_call']),
    (error: unknown) => error === failure,
  );
});
