import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  proverDisclosure,
  storeConsentRecord,
  withProverConsent,
} from '../packages/core/dist/index.js';
import {
  createStubPlatform,
  createStubProver,
  proverContract,
} from '../packages/dev/dist/index.js';
import { remoteProver } from '../packages/adapter-prover-remote/dist/index.js';
import {
  fakeService,
  oneCall,
  verifierKey,
} from '../packages/adapter-prover-remote/dist-test/one-call.js';

const T = { timeout: 10_000 };
const disclosure = proverDisclosure('Société 証明');
// Long enough for a request that leaked past the gate to reach the platform.
const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

/** @typedef {import('../packages/core/dist/index.js').ConsentAnswer} ConsentAnswer */

/** @param {(url: string) => void} onRequest */
function remoteGate(onRequest) {
  /** @type {(answer: ConsentAnswer) => void} */
  let answer = () => {};
  const platform = createStubPlatform({
    http: (request) => {
      onRequest(request.url);
      return fakeService(request);
    },
  });
  const prover = withProverConsent({
    prover: remoteProver({
      url: 'https://prover.example',
      platform,
      verifierKey: async () => verifierKey,
    }),
    disclosure,
    ask: () => new Promise((resolve) => (answer = resolve)),
    record: storeConsentRecord(platform.store, 'prover-consent'),
  });
  return { prover, answer: (/** @type {ConsentAnswer} */ a) => answer(a) };
}

/** @returns {import('../packages/core/dist/index.js').UnprovenTransaction} */
const unproven = () => ({ stage: 'unproven', bytes: oneCall().bytes });

test('no proof request leaves the client before consent, or after a decline', T, async () => {
  /** @type {string[]} */
  const sent = [];
  const { prover, answer } = remoteGate((url) => sent.push(url));

  const declined = prover.prove(unproven(), ['owner_call']);
  await settle();
  assert.equal(sent.length, 0);
  answer('declined');
  await assert.rejects(declined, { _tag: 'ProverConsentDeclinedError' });
  assert.equal(sent.length, 0);

  const accepted = prover.prove(unproven(), ['owner_call']);
  await settle();
  assert.equal(sent.length, 0);
  answer('accepted');
  await accepted;
  await settle();
  // A request from the declined call would double these.
  assert.deepEqual(
    sent.map((url) => new URL(url).pathname),
    ['/check', '/prove'],
  );
});

test(
  'the store record keeps any operator name, and a damaged or wiped entry reads as none',
  T,
  async () => {
    const platform = createStubPlatform();
    const record = storeConsentRecord(platform.store, 'prover-consent');
    await record.write({ version: disclosure.version, operator: disclosure.operator });
    assert.deepEqual(await record.read(), { version: '1-draft', operator: 'Société 証明' });

    await platform.store.set('prover-consent', Uint8Array.of(0x25, 0xff));
    assert.equal(await record.read(), undefined);
    await platform.store.set(
      'prover-consent',
      Uint8Array.from('{"version":1}', (c) => c.charCodeAt(0)),
    );
    assert.equal(await record.read(), undefined);

    await record.write({ version: disclosure.version, operator: disclosure.operator });
    await platform.store.wipe();
    assert.equal(await record.read(), undefined);
  },
);

const cases = proverContract(async () => {
  const platform = createStubPlatform();
  const inner = createStubProver();
  return {
    prover: withProverConsent({
      prover: inner,
      disclosure,
      ask: async () => 'accepted',
      record: storeConsentRecord(platform.store, 'prover-consent'),
    }),
    tx: { stage: 'unproven', bytes: new Uint8Array([1, 2, 3]) },
    circuitIds: [],
    hold: () => inner.holdNext(),
  };
});
for (const c of cases) test(`prover consent gate: ${c.name}`, T, () => c.run());
