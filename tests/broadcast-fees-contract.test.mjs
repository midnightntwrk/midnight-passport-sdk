import { test } from 'node:test';
import { createStubPlatform, feesContract } from '../packages/dev/dist/index.js';
import { sponsorFees } from '../packages/adapter-broadcast/dist/index.js';
import {
  hex,
  never,
  provenTx,
  respond,
  sponsorPays,
} from '../packages/adapter-broadcast/dist-test/support.js';

// The graph does not let the adapter depend on dev, so the contract runs here.
const tx = await provenTx();

const cases = feesContract(async () => {
  const platform = createStubPlatform();
  /** @type {'refuse' | 'hold' | undefined} */
  let next;
  platform.answer(async (request) => {
    const now = next;
    next = undefined;
    // A held request answers only when its signal aborts, as a stuck sponsor does.
    if (now === 'hold') return never(request);
    if (now === 'refuse') return respond(503, '{}');
    const { provenTx } = /** @type {{ provenTx: string }} */ (JSON.parse(String(request.body)));
    const paid = await sponsorPays(Uint8Array.from(Buffer.from(provenTx, 'hex')));
    return respond(200, JSON.stringify({ tx: hex(paid) }));
  });
  return {
    fees: sponsorFees({ url: 'https://sponsor.example/api/midnight/sponsor', platform }),
    tx,
    refuseNext: () => void (next = 'refuse'),
    hold: () => void (next = 'hold'),
  };
});

for (const c of cases) test(`sponsor fees: ${c.name}`, () => c.run());
