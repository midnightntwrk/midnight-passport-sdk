import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createIndexer } from '../packages/adapter-indexer/dist/index.js';
import { nodePlatform } from '../packages/adapter-nodejs/dist/index.js';
import { identifyBinding, readDeployedCircuits } from '../packages/contract/dist/index.js';

const indexerUrl = process.env.PASSPORT_LOCALNET_INDEXER;
const accounts = {
  wave: process.env.PASSPORT_WAVE_ONE_ACCOUNT,
  arm: process.env.PASSPORT_ONE_ARM_ACCOUNT,
};

test(
  'a wave-1 and a one-arm account on the local node read as the pinned build',
  {
    skip:
      (!indexerUrl || !accounts.wave || !accounts.arm) &&
      'set PASSPORT_LOCALNET_INDEXER, PASSPORT_WAVE_ONE_ACCOUNT, and PASSPORT_ONE_ARM_ACCOUNT',
  },
  async () => {
    // Only `http` is used, so the store folder is never made.
    const { http } = nodePlatform({ storeDir: 'unused' });
    const indexer = createIndexer({ indexerUrl: indexerUrl ?? '', http });
    const manifest = new Uint8Array(
      await readFile(
        new URL('../packages/contract/generated/passport-manifest.json', import.meta.url),
      ),
    );
    /** @param {string} address */
    const identify = async (address) => {
      const state = await indexer.contractState(address);
      const onChain = await readDeployedCircuits(
        state?.bytes ?? assert.fail(`no account ${address}`),
      );
      return identifyBinding(onChain, () => async () => manifest);
    };
    const wave = await identify(accounts.wave ?? '');
    assert.deepEqual([wave.status, wave.arms.p256], ['current', 'partial']);
    const arm = await identify(accounts.arm ?? '');
    assert.deepEqual([arm.arms.shared, arm.arms.p256], ['complete', 'complete']);
  },
);
