import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nodePlatform } from '../packages/adapter-nodejs/dist/index.js';
import { appBuild, browserTest, runPage, viteBundle, viteServe } from './chromium.mjs';
import { listen } from './server.mjs';
import { counterState, smoke } from './smoke.mjs';
import { parseJson } from '../scripts/json.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const counter = join(root, 'tests/fixtures/counter/compiled');

// The root lists no ledger, so the runtimes resolve as the Node.js adapter resolves them.
const fromAdapter = createRequire(join(root, 'packages/adapter-nodejs/package.json'));
/** @param {string} path @returns {Promise<unknown>} */
const importFile = (path) => import(pathToFileURL(path).href);
/** @param {string} name */
const importFromAdapter = (name) => importFile(fromAdapter.resolve(name));

/** @type {string[]} */
const dirs = [];
after(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

const modules = {
  runtime: /** @type {import('./smoke.mjs').Runtime} */ (
    await importFromAdapter('@midnight-ntwrk/compact-runtime')
  ),
  ledger: /** @type {import('./smoke.mjs').Ledger} */ (
    await importFromAdapter('@midnightntwrk/ledger-v9')
  ),
  compiled: /** @type {import('./smoke.mjs').Compiled} */ (
    await importFile(join(counter, 'contract/index.js'))
  ),
};
const state = await counterState(modules.runtime, modules.compiled);

test('the counter fixture comes from the pinned Compact toolchain', async () => {
  const pin = /\| Compact toolchain \| ([\d.]+) \|/.exec(
    await readFile(join(root, 'docs/compatibility.md'), 'utf8'),
  )?.[1];
  const info = /** @type {{ 'compiler-version'?: string }} */ (
    parseJson(await readFile(join(counter, 'compiler/contract-info.json'), 'utf8'))
  );
  assert.ok(pin, 'docs/compatibility.md names no Compact version');
  assert.equal(info['compiler-version'], pin, 'compile the counter again with the pinned version');
});

test(
  'the Node.js smoke reads a state over HTTP and builds one unproven call',
  { timeout: 60_000 },
  async (t) => {
    const storeDir = await mkdtemp(join(tmpdir(), 'mn-passport-store-'));
    dirs.push(storeDir);
    const platform = nodePlatform({ storeDir });
    await platform.loadRuntimes();
    const server = createServer((_, response) => response.writeHead(200).end(state));
    const base = await listen(server, (close) => t.after(close));
    const result = await smoke(platform, `${base}/state`, modules);
    assert.equal(result.intents, 1);
    assert.ok(result.bytes > 0);
  },
);

const page = join(root, 'tests/fixtures/app/page.js');
/** @type {Record<string, (entry: string) => Promise<Parameters<typeof runPage>[2]>>} */
const builds = {
  esbuild: async () => ({ build: appBuild }),
  Vite: viteBundle,
  'Vite dev': viteServe,
};
for (const [name, build] of Object.entries(builds)) {
  browserTest(`the ${name} app runs the smoke in Chromium`, async (bin) => {
    const options = { ...(await build(page)), files: { '/state': state } };
    const { value, errors, wasmRequests } = await runPage(
      bin,
      `import ${JSON.stringify(page)};`,
      options,
    );
    assert.deepEqual(errors, []);
    assert.equal(wasmRequests, 2);
    assert.ok(value && typeof value === 'object');
    assert.equal(Reflect.get(value, 'intents'), 1);
  });
}

const chain = join(root, 'tests/fixtures/app/chain.js');
for (const [name, build] of Object.entries(builds)) {
  browserTest(
    `the ${name} app loads the chain entry and the midnight-js of a call build`,
    async (bin) => {
      const { value, errors } = await runPage(
        bin,
        `import ${JSON.stringify(chain)};`,
        await build(chain),
      );
      assert.deepEqual(errors, []);
      assert.deepEqual(value, { build: 'function', hex: '0aff' });
    },
  );
}
