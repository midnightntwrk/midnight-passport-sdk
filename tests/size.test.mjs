import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { appBuild, bundle } from './chromium.mjs';
import { parseJson } from '../scripts/json.mjs';

const BASELINE = new URL('./fixtures/app/size-baseline.json', import.meta.url);
const LIMIT = 0.05;

test(
  'the gzip size of the esbuild app stays within 5% of the baseline: the entry chunk, all JS, and the WASM',
  { timeout: 60_000 },
  async (t) => {
    const { outputs } = await bundle("export * from './fixtures/app/app.js';", undefined, appBuild);
    const size = { entry: 0, js: 0, wasm: 0 };
    for (const file of outputs) {
      const kind = extname(file).slice(1);
      if (kind !== 'js' && kind !== 'wasm') continue;
      const bytes = gzipSync(await readFile(file)).length;
      size[kind] += bytes;
      // The app loads the lazy chunks only when it calls the chain code.
      if (basename(file) === 'page.js') size.entry = bytes;
    }
    t.diagnostic(`gzip: entry ${size.entry}, JS ${size.js}, WASM ${size.wasm} bytes`);
    const baseline = /** @type {typeof size} */ (parseJson(await readFile(BASELINE, 'utf8')));
    for (const kind of /** @type {const} */ (['entry', 'js', 'wasm'])) {
      const least = Math.round(baseline[kind] * (1 - LIMIT));
      const most = Math.round(baseline[kind] * (1 + LIMIT));
      // A shrink also fails, so that a missing file or a stale baseline does not pass.
      assert.ok(
        size[kind] >= least,
        `${kind}: ${size[kind]} bytes, under ${least} (the baseline - 5%)`,
      );
      assert.ok(
        size[kind] <= most,
        `${kind}: ${size[kind]} bytes, over ${most} (the baseline + 5%)`,
      );
    }
  },
);
