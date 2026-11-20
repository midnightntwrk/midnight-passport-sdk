import { dirname, isAbsolute, resolve } from 'node:path';
import { BUILTIN, bindingModule, builtinMessage, fileList, type ResolveEntry } from './bundler.js';

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
  apply: 'build';
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

/** For `vite build` with ESM output: the WASM URLs resolve against `import.meta.url`. */
export function passportWasm(): VitePluginLike {
  return {
    name: 'mn-passport-wasm',
    enforce: 'pre',
    apply: 'build',
    async resolveId(source, importer) {
      if (importer === undefined) return undefined;
      if (source === 'mn-passport:wasm') return FILE_LIST + importer;
      if (source.endsWith('.wasm')) return BINDING + resolve(dirname(importer), source);
      if (!BUILTIN.test(source)) return undefined;
      // A bare name such as `buffer` passes when the app installs a package of that name.
      if (!source.startsWith('node:')) {
        const found = await this.resolve(source, importer, { skipSelf: true });
        if (found && !found.external && isAbsolute(found.id)) return found.id;
      }
      return this.error(builtinMessage(importer, source));
    },
    async load(id) {
      if (id.startsWith(BINDING)) return bindingModule(id.slice(BINDING.length));
      if (!id.startsWith(FILE_LIST)) return undefined;
      const resolveEntry: ResolveEntry = async (name, from) => {
        const found = await this.resolve(name, from, { skipSelf: true });
        if (!found || found.external) throw new Error(`${from} cannot resolve ${name}.`);
        return found.id;
      };
      return fileList(resolveEntry, id.slice(FILE_LIST.length), '?url');
    },
  };
}
