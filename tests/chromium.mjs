import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { passportWasm } from '../packages/adapter-browser/dist/esbuild.js';
import { passportWasm as passportWasmVite } from '../packages/adapter-browser/dist/vite.js';
import { contractRoutes, listen } from './server.mjs';
import { parseJson } from '../scripts/json.mjs';

/**
 * @typedef {{ description?: string }} Exception
 * @typedef {{ targetId?: string, sessionId?: string, result?: { value?: unknown },
 *   exceptionDetails?: { exception?: Exception } }} CdpResult
 * @typedef {{ id?: number, method?: string, error?: { message: string }, result?: CdpResult,
 *   params?: { exceptionDetails: { text: string, exception?: Exception } } }} CdpMessage
 */

const adapterDist = fileURLToPath(new URL('../packages/adapter-browser/dist/', import.meta.url));
/** @type {string[]} */
const dirs = [];
after(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

/**
 * @param {string} contents
 * @param {{ resolveDir?: string } & import('esbuild').BuildOptions} [options]
 */
export async function bundle(contents, plugins = [passportWasm()], options = {}) {
  const { resolveDir = adapterDist, ...extra } = options;
  const outdir = await mkdtemp(join(tmpdir(), 'mn-passport-bundle-'));
  dirs.push(outdir);
  const result = await build({
    ...extra,
    stdin: { contents, resolveDir, sourcefile: 'page.js', loader: 'js' },
    entryNames: 'page',
    outdir,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    splitting: true,
    target: 'es2022',
    plugins,
    logLevel: 'silent',
    metafile: true,
  });
  return { outdir, outputs: Object.keys(result.metafile.outputs) };
}

const root = fileURLToPath(new URL('..', import.meta.url));
/** The esbuild settings of a dApp that depends on the packages: each name maps to its build. */
export const appBuild = {
  resolveDir: join(root, 'tests'),
  alias: {
    '@midnight-ntwrk/mn-passport-owner': join(root, 'packages/owner/dist/index.js'),
    '@midnight-ntwrk/mn-passport-adapter-browser': join(
      root,
      'packages/adapter-browser/dist/index.js',
    ),
  },
  nodePaths: [join(root, 'packages/adapter-browser/node_modules')],
};

/**
 * Builds the file `entry` with Vite and the same names as `appBuild`, into `page.js`.
 * @param {string} entry
 * @param {import('vite').Plugin[]} [plugins] run after the Passport plugin
 */
export async function viteBundle(entry, plugins = []) {
  const work = await mkdtemp(join(tmpdir(), 'mn-passport-vite-'));
  dirs.push(work);
  const outdir = join(work, 'out');
  /** @type {import('vite').Plugin} */
  const plugin = passportWasmVite();
  await viteBuild({
    configFile: false,
    root: join(root, 'tests'),
    cacheDir: join(work, 'cache'),
    publicDir: false,
    logLevel: 'silent',
    plugins: [plugin, ...plugins],
    resolve: {
      alias: {
        ...appBuild.alias,
        '@midnightntwrk/ledger-v9': join(appBuild.nodePaths[0] ?? '', '@midnightntwrk/ledger-v9'),
      },
    },
    build: {
      outDir: outdir,
      target: 'es2022',
      modulePreload: false,
      rolldownOptions: { input: entry, output: { entryFileNames: 'page.js' } },
    },
  });
  return { outdir };
}

// The servers, and the pages of a test that times out, close when the test ends.
/** @type {Set<() => Promise<void>>} */
const open = new Set();

/** @type {Record<string, string>} */
const TYPES = { '.js': 'text/javascript', '.wasm': 'application/wasm' };

/**
 * Serves the bundle and counts the WASM requests. A request to a route waits for it, then gets 204.
 * @param {string} outdir
 * @param {(url: string, wasmRequests: () => number) => Promise<void>} run
 * @param {{ files: Record<string, Uint8Array>, routes: Record<string, () => Promise<void>>,
 *   host: string }} options
 */
async function serve(outdir, run, { files, routes, host }) {
  let wasm = 0;
  /** @type {Error | undefined} */
  let failure;
  /** @type {(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) => Promise<unknown>} */
  const answer = async (request, response) => {
    const path = request.url ?? '/';
    if (path === '/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      return response.end('<script type="module" src="/page.js"></script>');
    }
    const file = files[path];
    if (file) return response.writeHead(200).end(file);
    const route = routes[path];
    if (route) return route().then(() => response.writeHead(204).end());
    if (contractRoutes(request, response)) return;
    if (path === '/cookie') return response.writeHead(200).end(request.headers.cookie ?? '');
    if (path === '/referer') return response.writeHead(200).end(request.headers.referer ?? '');
    if (path.endsWith('.wasm')) wasm += 1;
    try {
      const body = await readFile(join(outdir, path));
      response.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'text/plain' }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  };
  // A failed route fails the test after the run, and the page gets a 500.
  const server = createServer((request, response) => {
    answer(request, response).catch((/** @type {unknown} */ error) => {
      failure ??= error instanceof Error ? error : new Error(String(error));
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  const base = await listen(server, (close) => open.add(async () => close()), 'localhost');
  await run(`http://${host}:${new URL(base).port}/`, () => wasm);
  if (failure !== undefined) throw failure;
}

/**
 * Bundles `contents` as the page, opens it, runs `before`, and evaluates `expression`.
 * @param {string} bin
 * @param {string} contents
 * @param {{ expression?: string, before?: (page: Page) => Promise<void>,
 *   build?: Parameters<typeof bundle>[2], outdir?: string, files?: Record<string, Uint8Array>,
 *   routes?: Record<string, (page: Page) => Promise<void>>, host?: string }} [options]
 */
export async function runPage(bin, contents, options = {}) {
  const { expression = 'window.result', before, files = {}, host = 'localhost' } = options;
  /** @type {Page | undefined} */
  let opened;
  const routes = Object.fromEntries(
    Object.entries(options.routes ?? {}).map(([path, route]) => [
      path,
      async () => {
        assert.ok(opened, `${path} came before the page opened`);
        await route(opened);
      },
    ]),
  );
  const { outdir } = options.outdir
    ? { outdir: options.outdir }
    : await bundle(contents, [passportWasm()], options.build);
  /** @type {{ value: unknown, errors: string[], wasmRequests: number }} */
  let out = { value: undefined, errors: [], wasmRequests: 0 };
  await serve(
    outdir,
    async (url, wasmRequests) => {
      // Another host maps to localhost and counts as a secure context.
      const flags =
        host === 'localhost'
          ? []
          : [
              `--host-resolver-rules=MAP ${host} localhost`,
              `--unsafely-treat-insecure-origin-as-secure=${url}`,
            ];
      const page = await openPage(bin, url, flags);
      opened = page;
      try {
        await before?.(page);
        const value = await page.evaluate(expression);
        out = { value, errors: page.errors, wasmRequests: wasmRequests() };
      } finally {
        await page.close();
      }
    },
    { files, routes, host },
  );
  return out;
}

/** @typedef {Awaited<ReturnType<typeof openPage>>} Page */

/**
 * Adds a virtual authenticator that holds resident keys and presses itself, and gives its ID.
 * @param {Page} page
 * @param {boolean} verifies
 */
export async function addAuthenticator(page, verifies) {
  await page.send('WebAuthn.enable', { enableUI: false });
  const added = await page.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: verifies,
      isUserVerified: verifies,
      hasPrf: true,
      automaticPresenceSimulation: true,
    },
  });
  return String(Reflect.get(added, 'authenticatorId'));
}

const NAMES = ['chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome'];

/** @returns {string | undefined} */
function findChromium() {
  if (process.env.MN_PASSPORT_CHROMIUM) return process.env.MN_PASSPORT_CHROMIUM;
  const dirs = (process.env.PATH ?? '').split(delimiter);
  return NAMES.flatMap((name) => dirs.map((dir) => join(dir, name))).find((path) =>
    existsSync(path),
  );
}

/**
 * With no browser, the test skips, except when `CI` is set.
 * @param {string} name
 * @param {(bin: string, t: import('node:test').TestContext) => Promise<void>} run
 */
export function browserTest(name, run) {
  const bin = findChromium();
  test(
    name,
    { timeout: 60_000, skip: !bin && !process.env.CI && 'no Chromium on this machine' },
    async (t) => {
      t.after(async () => {
        for (const close of open) await close();
        open.clear();
      });
      assert.ok(bin, 'no Chromium found: set MN_PASSPORT_CHROMIUM');
      t.diagnostic(`${bin}: ${execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim()}`);
      await run(bin, t);
    },
  );
}

/**
 * Opens `url` in headless Chromium over the DevTools protocol. `close()` removes the profile.
 * @param {string} bin
 * @param {string} url
 * @param {string[]} [extraFlags]
 */
async function openPage(bin, url, extraFlags = []) {
  const profile = await mkdtemp(join(tmpdir(), 'mn-passport-chromium-'));
  const flags = [
    '--no-first-run',
    '--disable-background-networking',
    '--disable-component-update',
    ...extraFlags,
  ];
  // The profile is also the working folder and TMPDIR, so the browser leaves no file outside it.
  const chrome = spawn(
    bin,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      ...flags,
      'about:blank',
    ],
    { cwd: profile, env: { ...process.env, TMPDIR: profile }, stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const exited = new Promise((done) => chrome.once('exit', done));
  /** @type {WebSocket | undefined} */
  let socket;
  const stop = async () => {
    open.delete(stop);
    socket?.send(JSON.stringify({ id: 0, method: 'Browser.close' }));
    const timer = setTimeout(() => chrome.kill(), 5_000);
    if (!socket) chrome.kill();
    await exited;
    clearTimeout(timer);
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  };
  open.add(stop);
  try {
    const endpoint = await new Promise((/** @type {(value: string) => void} */ resolve, reject) => {
      let log = '';
      chrome.stderr.on('data', (chunk) => {
        log += String(chunk);
        const found = /DevTools listening on (ws:\S+)/.exec(log);
        if (found?.[1]) resolve(found[1]);
      });
      exited.then(() => reject(new Error(`Chromium exited: ${log}`)), reject);
    });
    const ws = new WebSocket(endpoint);
    socket = ws;
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    /** @type {string[]} */
    const errors = [];
    /** @type {Map<number, (message: CdpMessage) => void>} */
    const waiting = new Map();
    let loaded = () => {};
    ws.onmessage = (event) => {
      const message = /** @type {CdpMessage} */ (parseJson(String(event.data)));
      if (message.id) waiting.get(message.id)?.(message);
      if (message.method === 'Page.loadEventFired') loaded();
      if (message.method === 'Runtime.exceptionThrown' && message.params) {
        const { exception, text } = message.params.exceptionDetails;
        errors.push(exception?.description ?? text);
      }
    };
    let next = 0;
    /** @type {(method: string, params?: object, sessionId?: string) => Promise<CdpResult>} */
    const send = (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        const id = ++next;
        waiting.set(id, (message) => {
          waiting.delete(id);
          if (message.error) reject(new Error(`${method}: ${message.error.message}`));
          else resolve(message.result ?? {});
        });
        ws.send(JSON.stringify({ id, method, params, sessionId }));
      });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    const load = new Promise((resolve) => (loaded = () => resolve(undefined)));
    await send('Page.navigate', { url }, sessionId);
    await load;
    return {
      errors,
      /** @param {string} expression */
      async evaluate(expression) {
        const options = { expression, awaitPromise: true, returnByValue: true };
        const { result, exceptionDetails } = await send('Runtime.evaluate', options, sessionId);
        if (exceptionDetails) throw new Error(exceptionDetails.exception?.description);
        // The page decides the type of the value.
        return result?.value;
      },
      /** @param {string} method @param {object} [params] */
      send: (method, params) => send(method, params, sessionId),
      close: stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
