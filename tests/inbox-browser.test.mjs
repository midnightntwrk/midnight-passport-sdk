import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { browserTest, runPage } from './chromium.mjs';
import { parseJson } from '../scripts/json.mjs';

// The core inbox test checks the shape of this file.
const fixture =
  /** @type {{ vectors: { coin: { nonce: string, color: string, value: string } }[] }} */ (
    parseJson(
      readFileSync(
        new URL('../packages/core/test/fixtures/inbox-vectors.json', import.meta.url),
        'utf8',
      ),
    )
  );

// Web Crypto X25519 differs between browsers, so the codec runs on the browser's own crypto here.
const PAGE = `
  import { deriveInboxKey, openInboxEntry, sealInboxEntry } from '../../core/dist/index.js';
  const bytes = (hex) => Uint8Array.from(hex.match(/../g), (pair) => parseInt(pair, 16));
  const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  const show = (coin) => coin && [hex(coin.nonce), hex(coin.color), String(coin.value)].join(':');
  window.run = async () => {
    const { vectors } = ${JSON.stringify(fixture)};
    const opened = [];
    for (const v of vectors) {
      const secret = bytes(v.secretKey);
      opened.push(show(await openInboxEntry(bytes(v.entry), (e) => deriveInboxKey(secret, e))));
    }
    const [v] = vectors;
    const secret = bytes(v.secretKey);
    const key = (e) => deriveInboxKey(secret, e);
    const lowOrder = bytes(v.entry);
    lowOrder.fill(0, 2, 34);
    const pair = await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
    const own = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    const coin = { nonce: new Uint8Array(32).fill(1), color: new Uint8Array(32).fill(2), value: 5n };
    const sealed = await sealInboxEntry(own, coin);
    return {
      opened,
      lowOrder: (await openInboxEntry(lowOrder, key)) === undefined,
      roundTrip: show(await openInboxEntry(sealed, (e) => deriveInboxKey(pkcs8.slice(16), e))),
      zeroRecipient: await sealInboxEntry(new Uint8Array(32), coin).then(() => 'sealed', (e) => e._tag),
    };
  };
`;

browserTest('the inbox codec opens the reference entries in Chromium', async (bin) => {
  const { value, errors } = await runPage(bin, PAGE, { expression: 'window.run()' });
  assert.deepEqual(errors, []);
  assert.deepEqual(value, {
    opened: fixture.vectors.map(({ coin }) => [coin.nonce, coin.color, coin.value].join(':')),
    lowOrder: true,
    roundTrip: `${'01'.repeat(32)}:${'02'.repeat(32)}:5`,
    zeroRecipient: 'InboxRecipientKeyError',
  });
});
