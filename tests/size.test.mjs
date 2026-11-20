import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { appBuild, bundle } from './chromium.mjs';

const BASELINE = new URL('./fixtures/app/size-baseline.json', import.meta.url);
const LIMIT = 0.05;

test(
  'the gzip size of the esbuild app stays within 5% of the baseline, for the JS and the WASM',
  { timeout: 60_000 },
  async (t) => {
    const { outputs } = await bundle("export * from './fixtures/app/app.js';", undefined, appBuild);
    const size = { js: 0, wasm: 0 };
    for (const file of outputs) {
      const kind = extname(file).slice(1);
      if (kind === 'js' || kind === 'wasm') size[kind] += gzipSync(await readFile(file)).length;
    }
    t.diagnostic(`gzip: JS ${size.js} bytes, WASM ${size.wasm} bytes`);
    const baseline = /** @type {typeof size} */ (JSON.parse(await readFile(BASELINE, 'utf8')));
    for (const kind of /** @type {const} */ (['js', 'wasm'])) {
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
