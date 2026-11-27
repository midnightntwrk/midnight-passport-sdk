import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platformContract } from '../packages/dev/dist/index.js';
import { nodePlatform } from '../packages/adapter-nodejs/dist/index.js';
import { platformCases } from './platform-cases.mjs';
import { contractRoutes, listen } from './server.mjs';

/** @type {string[]} */
const dirs = [];
const storeDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'mn-passport-store-'));
  dirs.push(dir);
  return dir;
};

const server = createServer((request, response) => {
  if (!contractRoutes(request, response)) response.writeHead(404).end();
});
const base = await listen(server, after);
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

// A broken HTTP or load path can hang, so these tests have a time limit.
const LIMIT = { timeout: 10_000 };

const make = async () => ({
  platform: nodePlatform({ storeDir: storeDir() }),
  okUrl: `${base}/ok`,
  notFoundUrl: `${base}/missing`,
  redirectUrl: `${base}/moved`,
  pendingUrl: `${base}/pending`,
});
for (const c of [...platformContract(make), ...platformCases(make)]) {
  test(`nodePlatform: ${c.name}`, () => c.run());
}

test('the store files stay in the folder, for the user only, after a restart', async () => {
  const dir = join(storeDir(), 'store');
  await nodePlatform({ storeDir: dir }).store.set('../../x', new Uint8Array([7]));
  const { store } = nodePlatform({ storeDir: dir });
  assert.deepEqual(await store.keys(), ['../../x']);
  assert.deepEqual([...((await store.get('../../x')) ?? [])], [7]);
  assert.deepEqual(readdirSync(join(dir, '..')), ['store']);
  const [file = ''] = readdirSync(dir);
  assert.equal(statSync(dir).mode & 0o777, 0o700);
  assert.equal(statSync(join(dir, file)).mode & 0o777, 0o600);
});

test('wipe keeps a file that the store did not make', async () => {
  const dir = storeDir();
  writeFileSync(join(dir, 'notes.txt'), 'keep');
  writeFileSync(join(dir, '.tmp-notes'), 'keep');
  const { store } = nodePlatform({ storeDir: dir });
  await store.set('a', new Uint8Array([1]));
  await store.wipe();
  assert.deepEqual(readdirSync(dir).sort(), ['.tmp-notes', 'notes.txt']);
});

test('a store on a missing folder reads as empty', async () => {
  const { store } = nodePlatform({ storeDir: join(storeDir(), 'none') });
  assert.equal(await store.get('a'), undefined);
  assert.deepEqual(await store.keys(), []);
  await store.delete('a');
  await store.wipe();
});

test('get does not follow a planted link, and a folder that others can write is refused', async () => {
  const dir = storeDir();
  writeFileSync(join(dir, 'outside'), 'secret');
  symlinkSync(join(dir, 'outside'), join(dir, 'mnp-61'));
  await assert.rejects(nodePlatform({ storeDir: dir }).store.get('a'), { code: 'ELOOP' });
  chmodSync(dir, 0o770);
  await assert.rejects(nodePlatform({ storeDir: dir }).store.keys(), /only this user can write/);
});

test('wipe removes each entry it can, then reports the others', async () => {
  const dir = storeDir();
  mkdirSync(join(dir, 'mnp-00'));
  const { store } = nodePlatform({ storeDir: dir });
  await store.set('a', new Uint8Array([1]));
  await assert.rejects(store.wipe(), AggregateError);
  assert.deepEqual(readdirSync(dir), ['mnp-00']);
});

test(
  'loadRuntimes gives the same promise to each caller, and tries again after a failure',
  LIMIT,
  async () => {
    let fail = true;
    registerHooks({
      resolve(specifier, context, next) {
        if (fail && specifier === '@midnightntwrk/ledger-v9') throw new Error('planted failure');
        return next(specifier, context);
      },
    });
    const platform = nodePlatform({ storeDir: storeDir() });
    const first = platform.loadRuntimes();
    assert.equal(platform.loadRuntimes(), first);
    await assert.rejects(first, /planted failure/);
    fail = false;
    await platform.loadRuntimes();
  },
);
