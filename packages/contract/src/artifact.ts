import type { BindingVersion } from './binding-version.js';
import { ArtifactIntegrityError, ArtifactPinError } from './errors.js';
import { parseManifest, type AccManifest } from './manifest.js';
import { ACC_MANIFEST_SHA256 } from './pin.js';

// The lib is ES2022 only. Node and every browser in a secure context give Web Crypto as a global.
declare const crypto: {
  readonly subtle: { digest(algorithm: 'SHA-256', data: Uint8Array): Promise<ArrayBuffer> };
};

/** Resolves with the bytes of `path`, relative to the artifact root. */
export type ArtifactRead = (path: string) => Promise<Uint8Array>;

export interface AccArtifact {
  readonly manifest: AccManifest;
  readonly binding: BindingVersion;
  /**
   * Resolves only with bytes that match the manifest. Rejects a refused file with
   * `ArtifactIntegrityError`. A reader failure passes through unchanged. It refuses a
   * proving key before any read.
   */
  read(path: string): Promise<Uint8Array>;
}

export const MANIFEST_FILE = 'passport-manifest.json';

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Reads only the manifest. The pin covers the raw bytes, so it also refuses a manifest with the
 * same content in another layout. `pin` defaults to the hash of the manifest that this package ships.
 */
export async function openAccArtifact(
  read: ArtifactRead,
  pin: string = ACC_MANIFEST_SHA256,
): Promise<AccArtifact> {
  // Copies, so that a reader that keeps the buffer cannot change it after the check.
  const bytes = (await read(MANIFEST_FILE)).slice();
  const actual = await sha256(bytes);
  if (actual !== pin) throw new ArtifactPinError(pin, actual);
  const manifest = parseManifest(bytes);
  // A private copy, because a caller can cast `manifest.files` and change the Map.
  const files = new Map(manifest.files);
  return Object.freeze({
    manifest,
    binding: Object.freeze({
      compiler: manifest.toolchain.compiler,
      manifestHash: actual,
      originLength: manifest.originLength,
    }),
    async read(path: string): Promise<Uint8Array> {
      // A client never needs a proving key, and each one is many megabytes.
      if (path.endsWith('.prover')) throw new ArtifactIntegrityError(path, 'proving-key');
      const entry = files.get(path);
      if (!entry) throw new ArtifactIntegrityError(path, 'unlisted');
      const file = (await read(path)).slice();
      if (file.length !== entry.size || (await sha256(file)) !== entry.sha256) {
        throw new ArtifactIntegrityError(path, 'hash');
      }
      return file;
    },
  });
}
