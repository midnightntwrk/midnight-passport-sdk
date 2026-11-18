import assert from 'node:assert/strict';
import { browserTest, runPage } from './chromium.mjs';

/**
 * Runs `body` as an async function in a page, and gives its value. The page bundle resolves
 * from the adapter's dist folder.
 * @param {string} bin
 * @param {string} body
 */
async function inPage(bin, body) {
  const page = `
    import { browserPlatform } from './index.js';
    import { platformContract } from '../../dev/dist/index.js';
    import { platformCases } from '../../../tests/platform-cases.mjs';
    window.result = (async () => { ${body} })();
  `;
  const { value, errors } = await runPage(bin, page);
  assert.deepEqual(errors, []);
  return value;
}

const CONTRACT = `
  let made = 0;
  const make = async () => ({
    platform: browserPlatform({ namespace: 'mn-passport-contract-' + made++ }),
    okUrl: location.origin + '/ok',
    notFoundUrl: location.origin + '/missing',
    redirectUrl: location.origin + '/moved',
    pendingUrl: location.origin + '/pending',
  });
  const results = [];
  for (const c of [...platformContract(make), ...platformCases(make)]) {
    results.push(await c.run().then(() => ({ name: c.name }), (e) => ({ name: c.name, error: String(e?.stack ?? e) })));
  }
  return results;
`;

browserTest('browserPlatform passes the Platform contract in Chromium', async (bin, t) => {
  const results = /** @type {{ name: string, error?: string }[]} */ (await inPage(bin, CONTRACT));
  assert.ok(results.length > 0, 'the page ran no case');
  for (const { name, error } of results) {
    await t.test(name, () => assert.equal(error, undefined));
  }
});

browserTest(
  'wipe removes the database with a second connection open, and the store keeps only the bytes of a view',
  async (bin) => {
    const value = await inPage(
      bin,
      `
      const { store } = browserPlatform({ namespace: 'app' });
      await store.set('a', new Uint8Array(1000).fill(7).subarray(0, 4));
      const bytes = (await store.get('a')).buffer.byteLength;
      await browserPlatform({ namespace: 'app' }).store.keys();
      await store.wipe();
      return { bytes, databases: (await indexedDB.databases()).map((d) => d.name) };
    `,
    );
    assert.deepEqual(value, { bytes: 4, databases: [] });
  },
);

browserTest('http sends no cookie and no referrer', async (bin) => {
  const value = await inPage(
    bin,
    `
    const { http } = browserPlatform();
    document.cookie = 'session=s1';
    const text = async (path) =>
      new TextDecoder().decode((await http({ url: location.origin + path, method: 'GET' })).body);
    return { cookie: await text('/cookie'), referer: await text('/referer'), page: document.cookie };
  `,
  );
  assert.deepEqual(value, { cookie: '', referer: '', page: 'session=s1' });
});

browserTest('a wipe that an outside connection blocks times out', async (bin) => {
  const value = await inPage(
    bin,
    `
    const { store } = browserPlatform();
    await store.set('a', new Uint8Array([1]));
    await new Promise((done) => (indexedDB.open('mn-passport').onsuccess = done));
    return store.wipe().then(() => 'resolved', (e) => e._tag);
  `,
  );
  assert.equal(value, 'TimeoutError');
});
