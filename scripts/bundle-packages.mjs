import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJson } from './json.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

/** The packages that use Effect 4. */
export const BUNDLED = ['packages/core'];

const BANNER =
  '/*! Includes effect (https://github.com/Effect-TS/effect), MIT License, Copyright (c) 2023 Effectful Technologies Inc. */';

/** @type {import('esbuild').Plugin} */
const onlyEffectInline = {
  name: 'only-effect-inline',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, ({ path }) =>
      /^effect(\/|$)/.test(path) ? undefined : { path, external: true },
    );
  },
};

/** @param {string} entry @param {string} outfile */
async function bundleFile(entry, outfile) {
  /** @type {import('esbuild').BuildOptions} */
  const options = {
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    target: 'es2022',
    sourcemap: true,
    logLevel: 'warning',
    plugins: [onlyEffectInline],
  };
  // A dry run tells whether Effect is inlined, so only then the output carries its license.
  const { metafile } = await build({ ...options, write: false, metafile: true });
  const inlined = Object.keys(metafile.inputs).some((p) => /[\\/]effect[\\/]/.test(p));
  await build(inlined ? { ...options, banner: { js: BANNER } } : options);
}

/**
 * Replaces tsc's `dist/index.js` with a bundle that inlines Effect 4. tsc's
 * other files stay for the tests, and `files` keeps them out of the package.
 * @param {string} dir absolute, or relative to the repo root
 */
export async function bundle(dir) {
  const base = resolve(root, dir);
  const { exports } = /** @type {{ exports: Record<string, unknown> }} */ (
    parseJson(readFileSync(join(base, 'package.json'), 'utf8'))
  );
  // One entry for now; a split build adds more.
  if (Object.keys(exports).join() !== '.') throw new Error(`${dir}: bundle supports only "."`);
  await bundleFile(join(base, 'src/index.ts'), join(base, 'dist/index.js'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const dir of BUNDLED) await bundle(dir);
}
