import { getRandomValues } from 'node:crypto';
import type { Platform } from '@midnight-ntwrk/mn-passport-core';
import { fetchHttp } from './http.js';
import { fileStore } from './store.js';

export interface NodePlatformOptions {
  /** The store keeps its files here and removes no other file. A key has at most 120 UTF-8 bytes. */
  readonly storeDir: string;
}

// The quota of one `getRandomValues` call.
const RANDOM_CHUNK = 65_536;

// One after the other: in parallel, a compiled contract can run before its runtime is ready.
async function load(): Promise<void> {
  await import('@midnight-ntwrk/compact-runtime');
  await import('@midnightntwrk/ledger-v9');
}

/** `http` rejects a redirect with `NetworkError`, the same as a network failure. */
export function nodePlatform(options: NodePlatformOptions): Platform {
  if (options.storeDir === '') throw new TypeError('storeDir is empty.');
  let loading: Promise<void> | undefined;
  return {
    http: fetchHttp,
    randomBytes(length) {
      const bytes = new Uint8Array(length);
      for (let at = 0; at < length; at += RANDOM_CHUNK) {
        getRandomValues(bytes.subarray(at, at + RANDOM_CHUNK));
      }
      return bytes;
    },
    loadRuntimes() {
      if (!loading) {
        loading = load();
        loading.catch(() => {
          loading = undefined;
        });
      }
      return loading;
    },
    store: fileStore(options.storeDir),
    webauthn: undefined,
  };
}
