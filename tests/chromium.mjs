import { after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { passportWasm } from '../packages/adapter-browser/dist/esbuild.js';

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
