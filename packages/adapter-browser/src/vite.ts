import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUILTIN,
  SHIMS,
  bindingModule,
  builtinMessage,
  fileList,
  isRuntimeWasm,
  WASM_PACKAGES,
  type ResolveEntry,
} from './bundler.js';

interface ResolvedLike {
  readonly id: string;
  readonly external?: boolean | 'absolute' | 'relative';
}
interface PluginContextLike {
  resolve(
    source: string,
    importer?: string,
    options?: { skipSelf?: boolean },
  ): Promise<ResolvedLike | null>;
  error(message: string): never;
}

/** The part of the Vite plugin API that the plugin uses. */
export interface VitePluginLike {
  name: string;
  enforce: 'pre';
  config(): { optimizeDeps: { exclude: string[]; include: string[] } };
  configResolved(config: { readonly command: 'build' | 'serve'; readonly cacheDir: string }): void;
  resolveId(
    this: PluginContextLike,
    source: string,
    importer: string | undefined,
  ): Promise<string | undefined>;
  load(this: PluginContextLike, id: string): Promise<string | undefined>;
}

// The NUL prefix keeps the other plugins from reading these modules as files.
const FILE_LIST = '\0mn-passport-wasm:';
const BINDING = '\0mn-passport-binding:';

const SELF = '@midnight-ntwrk/mn-passport-adapter-browser';
const HERE = fileURLToPath(import.meta.url);
// The shims that are CommonJS packages. In serve, only the pre-bundler makes them modules.
const COMMONJS_SHIMS = ['buffer'];
// Vite skips a link of the chain that it cannot resolve, and goes on from the folder before it.
const PREBUNDLE = [
  `${SELF} > @midnight-ntwrk/compact-runtime > object-inspect`,
  ...COMMONJS_SHIMS.map((name) => `${SELF} > ${name}`),
  // The SDK imports it late. Found after the scan, it makes Vite reload the page.
  `${SELF} > @midnight-ntwrk/mn-passport-core/chain`,
];

// The dev server adds a query such as `?v=` to the resolved ids.
const bare = (id: string): string => id.replace(/\?.*$/s, '');

/** For `vite build` with ESM output and for `vite serve`: the WASM URLs resolve against `import.meta.url`. */
export function passportWasm(): VitePluginLike {
  // The pre-bundle folder, in serve only.
  let prebundled: string | undefined;
  return {
    name: 'mn-passport-wasm',
    enforce: 'pre',
    // The pre-bundler runs no plugin, so it cannot see the WASM imports.
    config: () => ({
      optimizeDeps: { exclude: [...WASM_PACKAGES], include: [...PREBUNDLE] },
    }),
    configResolved(config) {
      if (config.command === 'serve') prebundled = `${config.cacheDir}/deps/`;
    },
    async resolveId(source, importer) {
      if (importer === undefined) return undefined;
      if (source === 'mn-passport:wasm') return FILE_LIST + importer;
      if (source.endsWith('.wasm')) {
        if (!(await isRuntimeWasm(source, importer))) return undefined;
        return BINDING + resolve(dirname(importer), source);
      }
      if (!BUILTIN.test(source)) return undefined;
      // A bare name such as `buffer` passes when the app installs a package of that name, or has a shim.
      if (!source.startsWith('node:')) {
        const found = await this.resolve(source, importer, { skipSelf: true });
        if (found && !found.external && isAbsolute(found.id)) return found.id;
      }
      const shim = SHIMS.get(source);
      if (!shim) return this.error(builtinMessage(importer, source));
      if (prebundled === undefined || !COMMONJS_SHIMS.includes(source)) return shim;
      const own = await this.resolve(source, HERE, { skipSelf: true });
      if (own?.id.startsWith(prebundled) === true) return own.id;
      return this.error(`Vite did not pre-bundle the adapter's copy of "${source}".`);
    },
    async load(id) {
      if (id.startsWith(BINDING)) return bindingModule(id.slice(BINDING.length));
      if (!id.startsWith(FILE_LIST)) return undefined;
      const resolveEntry: ResolveEntry = async (name, from) => {
        const found = await this.resolve(name, from, { skipSelf: true });
        if (!found || found.external) throw new Error(`${from} cannot resolve ${name}.`);
        return bare(found.id);
      };
      return fileList(resolveEntry, id.slice(FILE_LIST.length), '?url');
    },
  };
}
