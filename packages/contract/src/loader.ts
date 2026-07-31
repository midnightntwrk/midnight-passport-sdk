// The integrity loader (FS-0.2 T3; ADR 0004): every artefact byte the SDK
// consumes is fetched through here and verified against the committed
// registry hashes before anything downstream may use it. Platform-neutral
// by construction: callers supply the byte source (browser: fetch; dev and
// tests: the local artefact directory), and hashing uses Web Crypto —
// available in browsers, workers, and Node (global from 19; baseline 22,
// FS-0.1 D-1). The package's browser-safety authority is architecture §4.4
// and the boundary lint (FS-0.2 D-7).
//
// Known limit, documented rather than hidden: the loader verifies bytes it
// is handed. The host still *executes* the generated module through its own
// import machinery, and supplies `@midnight-ntwrk/compact-runtime` to it —
// keeping "the bytes imported" identical to "the bytes verified", and the
// runtime compatible with the binding's recorded `runtimeVersion`, is the
// platform adapter's obligation (register entry; revisit at
// `adapter-browser`).
import type { AccRegistry } from './manifest.generated.js';
import { ACC_REGISTRY, resolveBinding } from './registry.js';

// The one runtime capability this module assumes: a Web Crypto global —
// declared minimally because the package deliberately compiles with neither
// DOM nor Node type libraries (architecture §4.4; the boundary lint's
// global allowlist admits exactly this one).
declare const crypto: {
  readonly subtle: { digest(algorithm: 'SHA-256', data: Uint8Array): Promise<ArrayBuffer> };
};

/** Fetches one artefact file, addressed relative to the version's artefact root. */
export type ArtefactSource = (relativePath: string) => Promise<Uint8Array>;

/** The per-circuit artefact parts a caller can request. */
export type ArtefactPart = 'zkir' | 'bzkir' | 'verifierKey' | 'proverKey';

/** Structural mirror of `AbortSignal` — the package compiles without DOM types. */
export interface AbortSignalLike {
  readonly aborted: boolean;
  readonly reason?: unknown;
}

/** What the device consumes to build calls; prover keys stay remote (provider-integration §6). */
const DEFAULT_PARTS: readonly ArtefactPart[] = ['zkir', 'bzkir', 'verifierKey'];

const PART_PATHS: Record<ArtefactPart, (circuit: string) => string> = {
  zkir: (c) => `zkir/${c}.zkir`,
  bzkir: (c) => `zkir/${c}.bzkir`,
  verifierKey: (c) => `keys/${c}.verifier`,
  proverKey: (c) => `keys/${c}.prover`,
};

/**
 * The generated module's artefact-relative path. Verified when requested
 * through {@link loadArtefact}; nothing forces a consumer to execute what
 * was verified — that obligation is the platform adapter's (header note).
 */
export const ACC_MODULE_FILE = 'contract/index.js';

/**
 * Thrown when fetched artefact bytes do not match the committed hash, or
 * when verification is requested for a file the registry carries no pin
 * for — a stale, swapped, tampered, or unpinnable artefact fails loudly
 * before proving is attempted (provider-integration §5.1; ADR 0004).
 * Discriminate on {@link ZkArtifactIntegrityError.code}, which is stable.
 * (US "Artifact" retained deliberately — the name comes from
 * provider-integration §5.1.)
 */
export class ZkArtifactIntegrityError extends Error {
  override readonly name = 'ZkArtifactIntegrityError';
  /** The stable machine-readable discriminant in the SDK error taxonomy. */
  readonly code = 'ZK_ARTIFACT_INTEGRITY';
  constructor(
    /** The artefact-relative file that failed verification. */
    readonly file: string,
    /** The committed hash, or the empty string when no pin exists. */
    readonly expected: string,
    /** The hash of the bytes received, or the empty string when nothing was fetched. */
    readonly actual: string,
    /** The binding version being loaded. */
    readonly bindingVersion: string,
  ) {
    super(
      expected === ''
        ? `Artefact integrity failure — ${file} has no committed pin in binding ` +
            `${bindingVersion}; verification is impossible, so the file is unusable (ADR 0004).`
        : `Artefact integrity failure — ${file} does not match the committed pin for ` +
            `binding ${bindingVersion} (expected ${expected.slice(0, 12)}…, got ` +
            `${actual.slice(0, 12)}…). Do not use these bytes (ADR 0004).`,
    );
  }
}

/**
 * Thrown when a requested circuit is absent from the binding's inventory,
 * or is a pure circuit (no artefact files exist for it — pure circuits
 * live inside the generated module). Discriminate on
 * {@link UnknownCircuitError.code}, which is stable.
 */
export class UnknownCircuitError extends Error {
  override readonly name = 'UnknownCircuitError';
  /** The stable machine-readable discriminant in the SDK error taxonomy. */
  readonly code = 'UNKNOWN_CIRCUIT';
  constructor(
    /** The circuit that was requested. */
    readonly circuit: string,
    /** The binding version whose inventory was consulted. */
    readonly bindingVersion: string,
    /** Absent from the inventory entirely, or present but pure (no files). */
    readonly reason: 'absent' | 'pure',
  ) {
    super(
      reason === 'pure'
        ? `Circuit "${circuit}" is pure — it has no artefact files to load; it lives ` +
            `inside the generated module (binding ${bindingVersion}).`
        : `Circuit "${circuit}" is not in binding ${bindingVersion}'s inventory (FS-0.2 D-8).`,
    );
  }
}

/**
 * A verified artefact load: every byte in `files` matched its committed
 * hash at load time. The map holds fresh copies (sources cannot mutate
 * them afterwards), but `ReadonlyMap` and `Uint8Array` immutability are
 * compile-time only — treat the result as yours and do not share it with
 * code you would not hand the artefact itself.
 */
export interface LoadedAccArtefact {
  /** The supported binding version these bytes belong to. */
  readonly bindingVersion: string;
  /** Artefact-relative path → verified bytes, for exactly what was requested. */
  readonly files: ReadonlyMap<string, Uint8Array>;
}

/** Options for {@link loadArtefact}. */
export interface LoadArtefactOptions {
  /** A supported binding version; defaults to the registry's `current`. */
  readonly version?: string;
  /**
   * Provable circuit names to load; defaults to every provable circuit in
   * the binding. Names are strings because the inventory is data-driven —
   * a literal-union `CircuitName` belongs to the manifest generator
   * (registry data owner), not here.
   */
  readonly circuits?: readonly string[];
  readonly parts?: readonly ArtefactPart[];
  /** Set false when only circuit material is needed. */
  readonly module?: boolean;
  /** Checked between fetches; aborting rejects with `signal.reason`. */
  readonly signal?: AbortSignalLike;
  /** Injectable for tests (the convention `resolveBinding` follows). */
  readonly registry?: AccRegistry;
}

const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Fetches and verifies artefact files for a supported binding version
 * (default: the registry's `current`). Every returned byte matched its
 * committed hash; any mismatch — or any requested file without a committed
 * pin — throws {@link ZkArtifactIntegrityError} and nothing is returned.
 * Also throws {@link import('./registry.js').UnsupportedBindingError} for
 * versions outside the supported set (before anything is fetched),
 * {@link UnknownCircuitError} for circuits the binding cannot serve, and a
 * plain `TypeError` when the Web Crypto global is unavailable — a
 * non-secure context only: every mobile engine implements it, installed
 * PWAs are secure contexts by construction, and passkeys share the same
 * requirement, so the realistic trigger is dev-on-device over plain-HTTP
 * LAN (use HTTPS-local or port-forward to localhost — FS-0.8). By default it loads the generated module plus each requested
 * circuit's ZKIR (text and binary) and verifier key — prover keys are
 * fetched remotely by `keyLocation` in the proving flow and can be
 * requested here explicitly (dev-local proving, FS-0.5). Files are fetched
 * sequentially; callers wanting parallelism can partition `circuits`
 * across calls.
 */
export async function loadArtefact(
  source: ArtefactSource,
  options?: LoadArtefactOptions,
): Promise<LoadedAccArtefact> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new TypeError(
      'Web Crypto is unavailable — artefact verification needs a secure context (FS-0.8).',
    );
  }
  const registry = options?.registry ?? ACC_REGISTRY;
  const bindingVersion = options?.version ?? registry.current;
  const binding = resolveBinding(bindingVersion, registry);
  const parts = options?.parts ?? DEFAULT_PARTS;
  const circuits =
    options?.circuits ??
    Object.entries(binding.circuits)
      .filter(([, pin]) => pin.proof)
      .map(([name]) => name);

  const expectations: [path: string, expectedHash: string][] = [];
  for (const circuit of circuits) {
    const pin = Object.hasOwn(binding.circuits, circuit) ? binding.circuits[circuit] : undefined;
    if (!pin) throw new UnknownCircuitError(circuit, bindingVersion, 'absent');
    if (!pin.proof || !pin.hashes) throw new UnknownCircuitError(circuit, bindingVersion, 'pure');
    for (const part of parts) {
      const expected = pin.hashes[part];
      const path = PART_PATHS[part](circuit);
      if (!expected) throw new ZkArtifactIntegrityError(path, '', '', bindingVersion);
      expectations.push([path, expected]);
    }
  }
  if (options?.module !== false) {
    const moduleHash = Object.hasOwn(binding.moduleHashes, ACC_MODULE_FILE)
      ? binding.moduleHashes[ACC_MODULE_FILE]
      : undefined;
    if (!moduleHash) throw new ZkArtifactIntegrityError(ACC_MODULE_FILE, '', '', bindingVersion);
    expectations.push([ACC_MODULE_FILE, moduleHash]);
  }

  const files = new Map<string, Uint8Array>();
  for (const [path, expected] of expectations) {
    if (options?.signal?.aborted) {
      throw options.signal.reason ?? new Error('loadArtefact aborted.');
    }
    // Copy defensively: the source may retain its reference (memoising or
    // pooled adapters) — verified bytes must be ours.
    const bytes = new Uint8Array(await source(path));
    const actual = await sha256Hex(bytes);
    if (actual !== expected) {
      throw new ZkArtifactIntegrityError(path, expected, actual, bindingVersion);
    }
    files.set(path, bytes);
  }
  return Object.freeze({ bindingVersion, files });
}
