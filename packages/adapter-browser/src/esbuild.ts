import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { dirname, join, resolve } from 'node:path';

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

const BUILTIN = new RegExp(`^(?:node:.*|(?:${builtinModules.join('|')})(?:/.*)?)$`);
// Each chain ends at the package whose browser entry imports a WASM file.
const RUNTIMES = [
  ['@midnight-ntwrk/compact-runtime', '@midnightntwrk/onchain-runtime-v4'],
  ['@midnightntwrk/ledger-v9'],
];
const ASSET = '?mn-passport-asset';
const POLYFILL_CHECK = Symbol('polyfill check');

const idOf = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex').slice(0, 16);

async function runtimeFiles(build: EsbuildBuildLike, from: string): Promise<string[]> {
  const files: string[] = [];
  for (const chain of RUNTIMES) {
    let dir = from;
    let entry = '';
    for (const name of chain) {
      const found = await build.resolve(name, { kind: 'import-statement', resolveDir: dir });
      if (found.errors.length > 0) throw new Error(found.errors.map((e) => e.text).join('\n'));
      entry = found.path;
      dir = dirname(entry);
    }
    const wasm = /from\s+["'](\.\/[^"']+\.wasm)["']/.exec(await readFile(entry, 'utf8'))?.[1];
    if (!wasm) throw new Error(`${entry} imports no WASM file.`);
    files.push(resolve(dir, wasm));
  }
  return files;
}

async function fileList(build: EsbuildBuildLike, from: string): Promise<string> {
  const files = await runtimeFiles(build, from);
  const imports = files.map((file, i) => `import u${i} from ${JSON.stringify(file + ASSET)};`);
  const entries = await Promise.all(
    files.map(async (file, i) => {
      const id = JSON.stringify(idOf(await readFile(file)));
      return `{ id: ${id}, url: new URL(u${i}, import.meta.url).href }`;
    }),
  );
  return `${imports.join('\n')}\nexport const files = [${entries.join(', ')}];\n`;
}

async function bindingModule(path: string): Promise<string> {
  const bytes = await readFile(path);
  const module = await WebAssembly.compile(bytes);
  const glue = [...new Set(WebAssembly.Module.imports(module).map((i) => i.module))];
  return [
    ...glue.map(
      (from, i) => `import * as g${i} from ${JSON.stringify(join(dirname(path), from))};`,
    ),
    `const booted = globalThis[Symbol.for('mn-passport.wasm')]?.get(${JSON.stringify(idOf(bytes))});`,
    "if (!booted) throw new Error('Call loadRuntimes() before you import a module that uses the Midnight runtimes, and keep one copy of each runtime.');",
    `booted.bind({ ${glue.map((from, i) => `${JSON.stringify(from)}: g${i}`).join(', ')} });`,
    'const e = booted.instance.exports;',
    ...WebAssembly.Module.exports(module).map(({ name }) => {
      if (!/^[A-Za-z_$][\w$]*$/.test(name)) throw new Error(`${path} exports "${name}".`);
      return `export const ${name} = e.${name};`;
    }),
  ].join('\n');
}

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
        return {
          errors: [
            {
              text: `${importer} imports the Node.js built-in "${path}". A browser cannot load it.`,
            },
          ],
        };
      });
      build.onResolve({ filter: /^mn-passport:wasm$/ }, ({ resolveDir }) => ({
        path: 'runtimes',
        namespace: 'mn-passport-wasm',
        pluginData: resolveDir,
      }));
      build.onLoad({ filter: /.*/, namespace: 'mn-passport-wasm' }, async ({ pluginData }) => {
        const from = String(pluginData);
        return { contents: await fileList(build, from), resolveDir: from, loader: 'js' };
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
