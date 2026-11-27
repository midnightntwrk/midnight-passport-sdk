import {
  CancelledError,
  type CallOptions,
  type JubjubChallenge,
  type KeyProvider,
  type Prover,
} from '@midnight-ntwrk/mn-passport-core';
import {
  createStubKeyProvider,
  createStubProver,
  keyProviderContract,
  proverContract,
  type KeyProviderHarness,
  type ProverHarness,
  type StubKeyOptions,
} from '@midnight-ntwrk/mn-passport-dev';
import { expectFailing, guardMs, run } from './run.js';

const keyHarness = (
  options: StubKeyOptions,
  wrap: (p: KeyProvider) => KeyProvider = (p) => p,
): KeyProviderHarness => {
  const stub = createStubKeyProvider(options);
  return {
    provider: wrap(stub),
    dismissNextPrompt: () => stub.dismissNextPrompt(),
    hold: () => stub.holdNext(),
  };
};
const schemes: StubKeyOptions[] = [
  { scheme: 'jubjub' },
  { scheme: 'p256' },
  { scheme: 'k256', envelope: 0 },
  { scheme: 'k256', envelope: 1 },
];
for (const options of schemes) {
  const label = `stub key provider (${options.scheme}${'envelope' in options ? ` ${options.envelope}` : ''})`;
  run(
    label,
    keyProviderContract(async () => keyHarness(options)),
  );
}

const tx = { stage: 'unproven', bytes: new Uint8Array([1, 2, 3]) } as const;
const proverHarness = (wrap: (p: Prover) => Prover = (p) => p): ProverHarness => {
  const stub = createStubProver();
  return { prover: wrap(stub), tx, circuitIds: ['c'], hold: () => stub.holdNext() };
};
run(
  'stub prover',
  proverContract(async () => proverHarness()),
);

const other = (p: KeyProvider): KeyProvider => (p.scheme === 'k256' ? { ...p, envelope: 1 } : p);
expectFailing(
  'the key provider contract fails a provider that signs with another envelope',
  keyProviderContract(async () => keyHarness({ scheme: 'k256', envelope: 0 }, other)),
  [['sign gives an authorization of the provider scheme', 'the envelope changed']],
);

const der = (p: KeyProvider): KeyProvider =>
  p.scheme === 'p256'
    ? {
        ...p,
        sign: async (c: Uint8Array, o?: CallOptions) => ({
          ...(await p.sign(c, o)),
          signature: new Uint8Array(70),
        }),
      }
    : p;
expectFailing(
  'the key provider contract fails a p256 signature in DER form',
  keyProviderContract(async () => keyHarness({ scheme: 'p256' }, der)),
  [['sign gives an authorization of the provider scheme', 'the signature has 70 bytes']],
);

const shortResponse = (p: KeyProvider): KeyProvider =>
  p.scheme === 'jubjub'
    ? {
        ...p,
        sign: async (c: JubjubChallenge, o?: CallOptions) => {
          const signed = await p.sign(c, o);
          return signed.scheme === 'jubjub' ? { ...signed, response: new Uint8Array(31) } : signed;
        },
      }
    : p;
expectFailing(
  'the key provider contract fails a JubJub response that is not 32 bytes',
  keyProviderContract(async () => keyHarness({ scheme: 'jubjub' }, shortResponse)),
  [['sign gives an authorization of the provider scheme', 'R or s has the wrong size']],
);

const deafKey = (p: KeyProvider): KeyProvider => ({ ...p, publicKey: () => p.publicKey() });
expectFailing(
  'the key provider contract fails a publicKey that ignores the signal',
  keyProviderContract(async () => keyHarness({ scheme: 'jubjub' }, deafKey), guardMs),
  [
    [
      'an abort before or during sign or publicKey rejects with CancelledError',
      'expected a rejection with CancelledError, got a result',
    ],
  ],
);

const early = (p: Prover): Prover => ({
  async prove(t, ids, options) {
    if (options?.signal?.aborted) throw new CancelledError('caller');
    await Promise.resolve();
    return p.prove(t, ids);
  },
});
expectFailing(
  'the prover contract fails a prover that reads the signal only at the start',
  proverContract(async () => proverHarness(early), guardMs),
  [
    ['an abort before or during prove rejects with CancelledError', 'no result in 300 ms'],
    ['no proof within timeoutMs rejects with TimeoutError', 'no result in 300 ms'],
  ],
);

// Above the 20 ms asked and below the guard, so only the timeout check can fail it.
const ownDeadline = (p: Prover): Prover => ({
  prove: (t, ids, options) => p.prove(t, ids, { ...options, timeoutMs: 100 }),
});
expectFailing(
  'the prover contract fails a prover that ignores timeoutMs',
  proverContract(async () => proverHarness(ownDeadline), guardMs),
  [['no proof within timeoutMs rejects with TimeoutError', 'after 100 ms, not 20 ms']],
);
