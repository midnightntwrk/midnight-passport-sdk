import { NetworkError } from '@midnight-ntwrk/mn-passport-core';

type Glue = Record<string, Record<string, (...args: unknown[]) => unknown>>;

/** The plugin's generated modules read this registry. */
interface Booted {
  readonly instance: WebAssembly.Instance;
  bind(glue: Glue): void;
}

// Global, so that two copies of the adapter in one page share the instances.
function globalMap<V>(name: string): Map<string, V> {
  const scope = globalThis as Record<symbol, Map<string, V> | undefined>;
  return (scope[Symbol.for(name)] ??= new Map<string, V>());
}

async function compile(url: string): Promise<WebAssembly.Module> {
  const response = await fetch(url).catch(() => {
    throw new NetworkError();
  });
  if (!response.ok) throw new Error(`A runtime WASM file answered ${response.status}.`);
  if (response.headers.get('content-type') === 'application/wasm') {
    return WebAssembly.compileStreaming(response);
  }
  return WebAssembly.compile(await response.arrayBuffer());
}

// The glue modules import the instance, so the instance takes imports that call the glue after it loads.
async function instantiate(module: WebAssembly.Module): Promise<Booted> {
  let glue: Glue | undefined;
  const imports: Record<string, Record<string, (...args: unknown[]) => unknown>> = {};
  for (const { module: from, name } of WebAssembly.Module.imports(module)) {
    (imports[from] ??= {})[name] = (...args) => {
      const target = glue?.[from]?.[name];
      if (!target) throw new Error(`The WASM import ${from} ${name} is not bound.`);
      return target(...args);
    };
  }
  const instance = await WebAssembly.instantiate(module, imports);
  return {
    instance,
    bind(next) {
      glue = next;
    },
  };
}

/** Each runtime loads once per page. A failed fetch rejects, and the next call tries again. */
export async function loadRuntimes(): Promise<void> {
  const { files } = await import('mn-passport:wasm');
  const booted = globalMap<Booted>('mn-passport.wasm');
  const loading = globalMap<Promise<void>>('mn-passport.wasm.loading');
  for (const { id, url } of files) {
    let load = loading.get(id);
    if (!load) {
      load = compile(url).then(async (module) => void booted.set(id, await instantiate(module)));
      loading.set(id, load);
      load.catch(() => loading.delete(id));
    }
    await load;
  }
  // One after the other: in parallel, a compiled contract can run before its runtime is ready.
  await import('@midnight-ntwrk/compact-runtime');
  await import('@midnightntwrk/ledger-v9');
}
