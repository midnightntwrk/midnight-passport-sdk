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

/** @param {Set<string>} shared modules of the main bundle @returns {import('esbuild').Plugin} */
const fromMain = (shared) => ({
  name: 'from-main',
  setup(b) {
    b.onResolve({ filter: /^\./ }, async ({ path, resolveDir, kind, pluginData }) => {
      if (pluginData === shared || resolveDir.includes('node_modules')) return undefined;
      const found = await b.resolve(path, { resolveDir, kind, pluginData: shared });
      return shared.has(found.path) ? { path: './index.js', external: true } : undefined;
    });
  },
});

/** @param {string} entry @param {string} outfile @param {import('esbuild').Plugin[]} plugins */
async function bundleFile(entry, outfile, plugins = []) {
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
    plugins: [...plugins, onlyEffectInline],
  };
  // A dry run tells whether Effect is inlined, so only then the output carries its license.
  const { metafile } = await build({ ...options, write: false, metafile: true });
  const inlined = Object.keys(metafile.inputs).some((p) => /[\\/]effect[\\/]/.test(p));
  await build(inlined ? { ...options, banner: { js: BANNER } } : options);
  return new Set(Object.keys(metafile.inputs).map((p) => resolve(p)));
}

/**
 * Replaces tsc's entry files with bundles that inline Effect 4. tsc's
 * other files stay for the tests, and `files` keeps them out of the package.
 * A subpath bundle gets the modules of the main bundle from it, so each class has one copy.
 * @param {string} dir absolute, or relative to the repo root
 */
export async function bundle(dir) {
  const base = resolve(root, dir);
  const { exports } = /** @type {{ exports: Record<string, unknown> }} */ (
    parseJson(readFileSync(join(base, 'package.json'), 'utf8'))
  );
  const shared = await bundleFile(join(base, 'src/index.ts'), join(base, 'dist/index.js'));
  const subpaths = Object.keys(exports).flatMap((k) => (k === '.' ? [] : [k.slice(1)]));
  for (const sub of subpaths)
    await bundleFile(join(base, `src${sub}.ts`), join(base, `dist${sub}.js`), [fromMain(shared)]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const dir of BUNDLED) await bundle(dir);
}
