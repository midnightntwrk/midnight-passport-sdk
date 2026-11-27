import { ArtifactManifestError } from './errors.js';

export type AccArm = 'jubjub' | 'k256' | 'p256';

export interface AccFile {
  readonly size: number;
  /** Lowercase hex. */
  readonly sha256: string;
}

export interface AccManifest {
  readonly schema: 1;
  readonly source: { readonly repository: string; readonly commit: string; readonly path: string };
  readonly toolchain: {
    readonly compiler: string;
    readonly compilerCommit: string;
    readonly language: string;
    readonly runtime: string;
    readonly zkir: string;
  };
  /** The WebAuthn origin length in bytes, fixed at compile time. */
  readonly originLength: number;
  /** The circuits that have a proof, grouped by arm. */
  readonly circuits: Readonly<Record<AccArm | 'shared', readonly string[]>>;
  /** The circuits that the deploy carries when the first device is on that arm. */
  readonly waveOne: Readonly<Record<AccArm, readonly string[]>>;
  /** Keyed by the path relative to the artifact root. */
  readonly files: ReadonlyMap<string, AccFile>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function record(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ArtifactManifestError(field);
  return value;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value === '') throw new ArtifactManifestError(field);
  return value;
}

function count(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new ArtifactManifestError(field);
  }
  return value;
}

function names(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) throw new ArtifactManifestError(field);
  return Object.freeze(value.map((item: unknown, i) => text(item, `${field}[${String(i)}]`)));
}

const HEX_64 = /^[0-9a-f]{64}$/;

// A frozen `Map` still takes `set`. The pins must not change after the load, also through a cast.
class FrozenMap<K, V> implements ReadonlyMap<K, V> {
  readonly #map: ReadonlyMap<K, V>;
  constructor(map: ReadonlyMap<K, V>) {
    this.#map = map;
    Object.freeze(this);
  }
  get size(): number {
    return this.#map.size;
  }
  get(key: K): V | undefined {
    return this.#map.get(key);
  }
  has(key: K): boolean {
    return this.#map.has(key);
  }
  forEach(callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void {
    this.#map.forEach((value, key) => {
      callback.call(thisArg, value, key, this);
    });
  }
  entries(): MapIterator<[K, V]> {
    return this.#map.entries();
  }
  keys(): MapIterator<K> {
    return this.#map.keys();
  }
  values(): MapIterator<V> {
    return this.#map.values();
  }
  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.#map.entries();
  }
}

function files(value: unknown): ReadonlyMap<string, AccFile> {
  const out = new Map<string, AccFile>();
  for (const [path, entry] of Object.entries(record(value, 'files'))) {
    const fields = record(entry, `files.${path}`);
    const sha256 = text(fields.sha256, `files.${path}.sha256`);
    if (!HEX_64.test(sha256)) throw new ArtifactManifestError(`files.${path}.sha256`);
    out.set(path, Object.freeze({ size: count(fields.size, `files.${path}.size`), sha256 }));
  }
  return new FrozenMap(out);
}

/** Rejects a manifest that does not have the shape of schema 1. */
export function parseManifest(bytes: Uint8Array): AccManifest {
  // acc-pin.mjs refuses non-ASCII, and the ES2022 lib has no TextDecoder.
  if (bytes.some((byte) => byte > 0x7f)) throw new ArtifactManifestError('(root)');
  let parsed: unknown;
  try {
    parsed = JSON.parse(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
  } catch {
    throw new ArtifactManifestError('(root)');
  }
  const root = record(parsed, '(root)');
  if (root.schema !== 1) throw new ArtifactManifestError('schema');
  const source = record(root.source, 'source');
  const toolchain = record(root.toolchain, 'toolchain');
  const circuits = record(root.circuits, 'circuits');
  const waveOne = record(root.waveOne, 'waveOne');
  return Object.freeze({
    schema: 1,
    source: {
      repository: text(source.repository, 'source.repository'),
      commit: text(source.commit, 'source.commit'),
      path: text(source.path, 'source.path'),
    },
    toolchain: {
      compiler: text(toolchain.compiler, 'toolchain.compiler'),
      compilerCommit: text(toolchain.compilerCommit, 'toolchain.compilerCommit'),
      language: text(toolchain.language, 'toolchain.language'),
      runtime: text(toolchain.runtime, 'toolchain.runtime'),
      zkir: text(toolchain.zkir, 'toolchain.zkir'),
    },
    originLength: count(root.originLength, 'originLength'),
    circuits: {
      shared: names(circuits.shared, 'circuits.shared'),
      jubjub: names(circuits.jubjub, 'circuits.jubjub'),
      k256: names(circuits.k256, 'circuits.k256'),
      p256: names(circuits.p256, 'circuits.p256'),
    },
    waveOne: {
      jubjub: names(waveOne.jubjub, 'waveOne.jubjub'),
      k256: names(waveOne.k256, 'waveOne.k256'),
      p256: names(waveOne.p256, 'waveOne.p256'),
    },
    files: files(root.files),
  });
}
