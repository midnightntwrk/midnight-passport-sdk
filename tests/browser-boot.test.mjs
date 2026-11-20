import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { browserTest, bundle, runPage, viteBundle } from './chromium.mjs';
import { listen } from './server.mjs';

const EMPTY_WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

/** Stands in for the WASM list and the two runtimes, which record the order of their load. */
const stubRuntimes = (/** @type {string} */ url) => ({
  name: 'stub-runtimes',
  /** @param {import('esbuild').PluginBuild} build */
  setup(build) {
    const names = /^(mn-passport:wasm|@midnight-ntwrk\/compact-runtime|@midnightntwrk\/ledger-v9)$/;
    build.onResolve({ filter: names }, ({ path }) => ({ path, namespace: 'stub' }));
    // The contract runtime finishes late, so a parallel load records the ledger first.
    const late = (/** @type {string} */ path) =>
      path === '@midnight-ntwrk/compact-runtime'
        ? 'await new Promise((done) => setTimeout(done, 50));'
        : '';
    build.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => ({
      contents:
        // The URL is the ID, so each test boots its own entry in the global registry.
        path === 'mn-passport:wasm'
          ? `export const files = [{ id: ${JSON.stringify(url)}, url: ${JSON.stringify(url)} }];`
          : `${late(path)} globalThis.mnPassportOrder.push(${JSON.stringify(path)});`,
      loader: 'js',
    }));
  },
});

/**
 * Serves an empty WASM file that answers 500 to the first request, until the test ends.
 * @param {import('node:test').TestContext} t
 * @param {(url: string, requests: () => number) => Promise<void>} run
 */
async function flakyWasm(t, run) {
  let requests = 0;
  const server = createServer((_, response) => {
    requests += 1;
    if (requests === 1) return response.writeHead(500).end();
    response.writeHead(200, { 'content-type': 'application/wasm' }).end(EMPTY_WASM);
  });
  const base = await listen(server, (close) => t.after(close));
  await run(`${base}/empty.wasm`, () => requests);
}

/**
 * Bundles `page` with the stubs and imports it in Node.js.
 * @param {string} page
 * @param {string} url
 * @returns {Promise<unknown>}
 */
async function importStubbed(page, url) {
  const { outdir } = await bundle(page, [stubRuntimes(url)]);
  return import(pathToFileURL(join(outdir, 'page.js')).href);
}

/** @type {Record<string, (entry: string) => Promise<unknown>>} */
const bundlers = {
  esbuild: (entry) => bundle(`import ${JSON.stringify(entry)};`),
  Vite: viteBundle,
};
for (const [name, build] of Object.entries(bundlers)) {
  test(`${name}: a Node.js built-in fails the build, unless the app has a package of that name`, async (t) => {
    const app = await mkdtemp(join(tmpdir(), 'mn-passport-app-'));
    t.after(() => rm(app, { recursive: true, force: true }));
    await mkdir(join(app, 'node_modules/buffer'), { recursive: true });
    await writeFile(join(app, 'node_modules/buffer/package.json'), '{ "main": "index.js" }');
    await writeFile(join(app, 'node_modules/buffer/index.js'), 'export const Buffer = 1;');
    await writeFile(join(app, 'prefixed.js'), "import 'node:fs';");
    await writeFile(join(app, 'bare.js'), "import 'fs';");
    await writeFile(
      join(app, 'buffer.js'),
      "import { Buffer } from 'buffer'; console.log(Buffer);",
    );
    await assert.rejects(
      build(join(app, 'prefixed.js')),
      /imports the Node\.js built-in "node:fs"/,
    );
    await assert.rejects(build(join(app, 'bare.js')), /imports the Node\.js built-in "fs"/);
    await build(join(app, 'buffer.js'));
  });
}

test('an esbuild external does not pass the built-in check', async () => {
  await assert.rejects(bundle("import 'fs';", undefined, { external: ['fs'] }), /built-in "fs"/);
});

test(
  'the boot loads the contract runtime before the ledger, and retries a failed load',
  { timeout: 10_000 },
  async (t) => {
    await flakyWasm(t, async (url, requests) => {
      const page = "export { browserPlatform } from './index.js';";
      const stubbed =
        /** @type {{ browserPlatform: () => { loadRuntimes: () => Promise<void> } }} */ (
          await importStubbed(page, url)
        );
      const { loadRuntimes } = stubbed.browserPlatform();
      /** @type {string[]} */
      const order = [];
      Reflect.set(globalThis, 'mnPassportOrder', order);
      await assert.rejects(loadRuntimes());
      await loadRuntimes();
      assert.equal(requests(), 2);
      assert.deepEqual(order, ['@midnight-ntwrk/compact-runtime', '@midnightntwrk/ledger-v9']);
    });
  },
);

browserTest(
  'a module that reaches a runtime before the boot fails with a clear message',
  async (bin) => {
    const page = "import { ContractState } from '@midnightntwrk/ledger-v9'; ContractState;";
    const { errors } = await runPage(bin, page);
    assert.match(errors.join('\n'), /Call loadRuntimes\(\) before you import a module/);
  },
);
