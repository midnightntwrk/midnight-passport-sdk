import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { passportWasm } from '../packages/adapter-browser/dist/esbuild.js';
import { browserTest, bundle, runPage, viteBundle, viteServe } from './chromium.mjs';
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

// Stands in for the app's own WASM handling, which runs after the Passport plugin.
const APP_WASM = 'export default "app wasm";';
/** @type {import('esbuild').Plugin} */
const appWasmEsbuild = {
  name: 'app-wasm',
  setup(build) {
    build.onResolve({ filter: /\.wasm$/ }, ({ path }) => ({ path, namespace: 'app-wasm' }));
    build.onLoad({ filter: /.*/, namespace: 'app-wasm' }, () => ({ contents: APP_WASM }));
  },
};
/** @type {import('vite').Plugin} */
const appWasmVite = {
  name: 'app-wasm',
  enforce: 'pre',
  resolveId: (source) => (source.endsWith('.wasm') ? `\0app-wasm:${source}` : undefined),
  load: (id) => (id.startsWith('\0app-wasm:') ? APP_WASM : undefined),
};

/** @type {Record<string, (entry: string) => Promise<{ outdir: string }>>} */
const bundlers = {
  esbuild: (entry) => bundle(`import ${JSON.stringify(entry)};`, [passportWasm(), appWasmEsbuild]),
  Vite: (entry) => viteBundle(entry, [appWasmVite]),
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

  test(`${name}: a WASM import outside the Midnight runtimes is left to the app`, async (t) => {
    const app = await mkdtemp(join(tmpdir(), 'mn-passport-app-'));
    t.after(() => rm(app, { recursive: true, force: true }));
    const other = join(app, 'node_modules/other-wasm');
    await mkdir(other, { recursive: true });
    await writeFile(join(other, 'package.json'), '{ "name": "other-wasm", "main": "index.js" }');
    await writeFile(join(other, 'index.js'), "export { default } from './x.wasm';");
    await writeFile(join(other, 'x.wasm'), EMPTY_WASM);
    await writeFile(
      join(app, 'main.js'),
      "import a from 'other-wasm'; import b from 'other-wasm/x.wasm'; console.log(a, b);",
    );
    const { outdir } = await build(join(app, 'main.js'));
    const page = await readFile(resolve(outdir, 'page.js'), 'utf8');
    assert.match(page, /app wasm/);
    assert.doesNotMatch(page, /loadRuntimes/);
  });
}

/** @type {Record<string, (entry: string) => Promise<{ build?: object, outdir?: string }>>} */
const pages = {
  esbuild: async () => ({}),
  Vite: async (entry) => viteBundle(entry),
};
for (const [name, build] of Object.entries(pages)) {
  browserTest(`${name}: a bare buffer or assert gets the adapter's browser copy`, async (bin) => {
    const app = await mkdtemp(join(tmpdir(), 'mn-passport-app-'));
    try {
      // The default import shape that TypeScript emits, as @subsquid/scale-codec uses it.
      await writeFile(
        join(app, 'check.cjs'),
        `const assert = ((m) => (m && m.__esModule ? m : { default: m }))(require('assert'));
module.exports = (value) => { try { assert.default(value, 'no'); return 'passed'; } catch (e) { return e.message; } };`,
      );
      const entry = join(app, 'page.js');
      await writeFile(
        entry,
        `import { Buffer } from 'buffer';
import check from './check.cjs';
window.result = { hex: Buffer.from('0aff', 'hex').toString('hex'), pass: check(true), fail: check(false) };`,
      );
      const { value, errors } = await runPage(bin, `import ${JSON.stringify(entry)};`, {
        ...(await build(entry)),
      });
      assert.deepEqual(errors, []);
      assert.deepEqual(value, { hex: '0aff', pass: 'passed', fail: 'no' });
    } finally {
      await rm(app, { recursive: true, force: true });
    }
  });
}

browserTest('Vite dev: a bare buffer or assert in app code gets the browser copy', async (bin) => {
  const app = await mkdtemp(join(tmpdir(), 'mn-passport-app-'));
  try {
    const entry = join(app, 'page.js');
    await writeFile(
      join(app, 'late.js'),
      `import { Buffer } from 'buffer';
import assert from 'assert';
export const result = { hex: Buffer.from('0aff', 'hex').toString('hex'), assert: typeof assert };`,
    );
    // The scan before the first page load cannot see a computed import.
    await writeFile(
      entry,
      "const late = './late.js'; window.result = import(/* @vite-ignore */ late).then((m) => m.result);",
    );
    const { value, errors } = await runPage(bin, '', await viteServe(entry));
    assert.deepEqual(errors, []);
    assert.deepEqual(value, { hex: '0aff', assert: 'function' });
  } finally {
    await rm(app, { recursive: true, force: true });
  }
});

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
