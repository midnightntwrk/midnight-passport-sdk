import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { BUILTIN, bindingModule, builtinMessage, fileList, type ResolveEntry } from './bundler.js';

interface Message {
  readonly text: string;
}
// esbuild owns `pluginData` and declares it `any`.
interface ResolveArgs {
  readonly path: string;
  readonly importer: string;
  readonly resolveDir: string;
  readonly kind: string;
  readonly pluginData?: unknown;
}
interface Resolved {
  path?: string;
  namespace?: string;
  external?: boolean;
  sideEffects?: boolean;
}
interface ResolveResult extends Resolved {
  pluginData?: unknown;
  errors?: Message[];
}
interface LoadArgs {
  readonly path: string;
  readonly pluginData?: unknown;
}
interface LoadResult {
  contents?: string | Uint8Array;
  resolveDir?: string;
  loader?: 'js' | 'file';
  errors?: Message[];
}
interface Filter {
  filter: RegExp;
  namespace?: string;
}

/** The part of the esbuild plugin API that the plugin uses. */
export interface EsbuildBuildLike {
  onResolve(
    options: Filter,
    callback: (args: ResolveArgs) => Promise<ResolveResult | undefined> | ResolveResult,
  ): void;
  onLoad(options: Filter, callback: (args: LoadArgs) => Promise<LoadResult>): void;
  resolve(
    path: string,
    options: { kind: 'import-statement'; resolveDir: string; pluginData?: unknown },
  ): Promise<Resolved & { path: string; errors: Message[] }>;
}

export interface EsbuildPluginLike {
  name: string;
  setup(build: EsbuildBuildLike): void;
}

const ASSET = '?mn-passport-asset';
const POLYFILL_CHECK = Symbol('polyfill check');

/** For an ESM browser build: the WASM URLs resolve against `import.meta.url`. */
export function passportWasm(): EsbuildPluginLike {
  return {
    name: 'mn-passport-wasm',
    setup(build) {
      // A bare name such as `buffer` passes when the app installs a package of that name.
      build.onResolve({ filter: BUILTIN }, async ({ path, importer, resolveDir, pluginData }) => {
        if (pluginData === POLYFILL_CHECK) return undefined;
        if (!path.startsWith('node:')) {
          const options = {
            kind: 'import-statement',
            resolveDir,
            pluginData: POLYFILL_CHECK,
          } as const;
          const { errors, ...resolved } = await build.resolve(path, options);
          // An external or a virtual module is not a package file in the bundle.
          if (errors.length === 0 && !resolved.external && resolved.namespace === 'file') {
            return resolved;
          }
        }
        return { errors: [{ text: builtinMessage(importer, path) }] };
      });
      const resolveEntry: ResolveEntry = async (name, from) => {
        const options = { kind: 'import-statement', resolveDir: dirname(from) } as const;
        const found = await build.resolve(name, options);
        if (found.errors.length > 0) throw new Error(found.errors.map((e) => e.text).join('\n'));
        return found.path;
      };
      build.onResolve({ filter: /^mn-passport:wasm$/ }, ({ importer }) => ({
        path: 'runtimes',
        namespace: 'mn-passport-wasm',
        pluginData: importer,
      }));
      build.onLoad({ filter: /.*/, namespace: 'mn-passport-wasm' }, async ({ pluginData }) => {
        const from = String(pluginData);
        const contents = await fileList(resolveEntry, from, ASSET);
        return { contents, resolveDir: dirname(from), loader: 'js' };
      });
      build.onResolve({ filter: /\.wasm\?mn-passport-asset$/ }, ({ path }) => ({
        path: path.slice(0, -ASSET.length),
        namespace: 'mn-passport-asset',
      }));
      build.onLoad({ filter: /.*/, namespace: 'mn-passport-asset' }, async ({ path }) => ({
        contents: await readFile(path),
        loader: 'file',
      }));
      build.onResolve({ filter: /\.wasm$/ }, ({ path, resolveDir }) => ({
        path: resolve(resolveDir, path),
        namespace: 'mn-passport-binding',
      }));
      build.onLoad({ filter: /.*/, namespace: 'mn-passport-binding' }, async ({ path }) => ({
        contents: await bindingModule(path),
        resolveDir: dirname(path),
        loader: 'js',
      }));
    },
  };
}
