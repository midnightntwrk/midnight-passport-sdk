import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ProverRejectedError } from '../dist/errors.js';
import { createLedgerProvider } from '../dist/ledger-provider.js';
import { openCall, type Query, type Transport } from '../dist/transport.js';
import type { ProvingProvider } from '@midnightntwrk/ledger-v9';

const address = 'ab'.repeat(32);
const verifierKey = Uint8Array.of(7, 7, 7);
const vk = createHash('sha256').update(verifierKey).digest('hex');
const location = `contract:${address}/owner_call?vk=${vk}`;

interface Post {
  readonly route: string;
  readonly query: Query;
  readonly body: Uint8Array;
}

function providerHarness(options: { calls?: string[]; transport?: Transport } = {}) {
  const posts: Post[] = [];
  const call = openCall(undefined, 10_000);
  const ledger = createLedgerProvider({
    call,
    calls: new Set(options.calls ?? [`${address}/owner_call`]),
    transport: async (route, query, body, ended) => {
      posts.push({ route, query, body });
      if (options.transport) return options.transport(route, query, body, ended);
      return Uint8Array.of(route === 'check' ? 1 : 2);
    },
    verifierKey: async () => verifierKey,
    parseCheckResult: () => [],
  });
  return { ...ledger, posts, close: () => call.close() };
}

// The real ledger gives a binding for a contract call, so only this layer reaches the other branch.
test('prove with no binding input sends no binding in the query', async () => {
  const { provider, posts, close } = providerHarness();
  await provider.check(Uint8Array.of(9), location);
  assert.deepEqual(await provider.prove(Uint8Array.of(9), location), Uint8Array.of(2));
  assert.deepEqual(posts.at(-1)?.query, { key: location });
  close();
});

test('a built-in label outside prove, or a contract label not checked first, rejects', async () => {
  // Each case gets its own call, because the first rejection ends the call.
  const cases = [
    (provider: ProvingProvider) => provider.check(Uint8Array.of(9), 'midnight/zswap/spend'),
    (provider: ProvingProvider) => provider.lookupKey('midnight/dust/spend'),
    (provider: ProvingProvider) => provider.prove(Uint8Array.of(9), location),
  ];
  for (const run of cases) {
    const { provider, posts, close } = providerHarness();
    await assert.rejects(run(provider), { _tag: 'ProverRejectedError', reason: 'input' });
    assert.deepEqual(posts, []);
    close();
  }
});

test('the first callback error is the one kept', async () => {
  const { provider, kept, close } = providerHarness({ calls: [] });
  await assert.rejects(provider.check(Uint8Array.of(9), location));
  await assert.rejects(provider.check(Uint8Array.of(9), 'owner_call'));
  assert.equal(Reflect.get(kept()?.error as object, 'reason'), 'undeclared-circuit');
  close();
});

test('a final rejection of one call ends the others, and is the error kept', async () => {
  const { provider, kept, close } = providerHarness({
    transport: async (_route, query, _body, ended) => {
      if (query.key === 'midnight/zswap/spend') throw new ProverRejectedError('input', 400);
      return new Promise<Uint8Array>((_resolve, reject) => {
        const end = (): void => {
          const reason = ended.ended();
          if (reason) reject(reason);
        };
        end();
        ended.signal.addEventListener('abort', end);
      });
    },
  });
  const slow = provider.check(Uint8Array.of(1), location);
  await assert.rejects(provider.prove(Uint8Array.of(1), 'midnight/zswap/spend'));
  await assert.rejects(slow, (error: unknown) => error === kept()?.error);
  close();
});
