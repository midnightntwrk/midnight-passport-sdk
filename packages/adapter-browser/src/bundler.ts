import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { dirname, join, resolve } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-inferrable-types -- isolatedDeclarations needs the type.
export const BUILTIN: RegExp = new RegExp(`^(?:node:.*|(?:${builtinModules.join('|')})(?:/.*)?)$`);

export const builtinMessage = (importer: string, path: string): string =>
  `${importer} imports the Node.js built-in "${path}". A browser cannot load it.`;

/** Gives the file of the browser entry of `name`, as `from` imports it. */
export type ResolveEntry = (name: string, from: string) => Promise<string>;

// Each chain ends at the package whose browser entry imports a WASM file.
const RUNTIMES = [
  ['@midnight-ntwrk/compact-runtime', '@midnightntwrk/onchain-runtime-v4'],
  ['@midnightntwrk/ledger-v9'],
];

const idOf = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex').slice(0, 16);

async function runtimeFiles(resolveEntry: ResolveEntry, from: string): Promise<string[]> {
  const files: string[] = [];
  for (const chain of RUNTIMES) {
    let entry = from;
    for (const name of chain) entry = await resolveEntry(name, entry);
    const wasm = /from\s+["'](\.\/[^"']+\.wasm)["']/.exec(await readFile(entry, 'utf8'))?.[1];
    if (!wasm) throw new Error(`${entry} imports no WASM file.`);
    files.push(resolve(dirname(entry), wasm));
  }
  return files;
}

/** The `mn-passport:wasm` module. The bundler turns an import of a file with `query` into its URL. */
export async function fileList(
  resolveEntry: ResolveEntry,
  from: string,
  query: string,
): Promise<string> {
  const files = await runtimeFiles(resolveEntry, from);
  const imports = files.map((file, i) => `import u${i} from ${JSON.stringify(file + query)};`);
  const entries = await Promise.all(
    files.map(async (file, i) => {
      const id = JSON.stringify(idOf(await readFile(file)));
      return `{ id: ${id}, url: new URL(u${i}, import.meta.url).href }`;
    }),
  );
  return `${imports.join('\n')}\nexport const files = [${entries.join(', ')}];\n`;
}

/** Stands in for the WASM file at `path`, with the exports of the instance that `loadRuntimes()` made. */
export async function bindingModule(path: string): Promise<string> {
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
