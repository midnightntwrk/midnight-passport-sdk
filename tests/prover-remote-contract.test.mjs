import { test } from 'node:test';
import { createStubPlatform, proverContract } from '../packages/dev/dist/index.js';
import { remoteProver } from '../packages/adapter-prover-remote/dist/index.js';
import {
  fakeService,
  oneCall,
  verifierKey,
} from '../packages/adapter-prover-remote/dist-test/one-call.js';

const cases = proverContract(async () => {
  const platform = createStubPlatform({ http: fakeService });
  // A stuck service: the stub platform ends the request only when its signal aborts.
  /** @returns {Promise<import('../packages/core/dist/index.js').HttpResponse>} */
  const stuck = () => {
    platform.answer(fakeService);
    return new Promise(() => {});
  };
  return {
    prover: remoteProver({
      url: 'https://prover.example',
      platform,
      verifierKey: async () => verifierKey,
      defaultTimeoutMs: 1000,
    }),
    tx: { stage: 'unproven', bytes: oneCall().bytes },
    circuitIds: ['owner_call'],
    hold: () => platform.answer(stuck),
  };
});

for (const c of cases) test(`remote prover: ${c.name}`, { timeout: 30_000 }, () => c.run());
