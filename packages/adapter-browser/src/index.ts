import type { Platform } from '@midnight-ntwrk/mn-passport-core';
import { fetchHttp } from './http.js';
import { loadRuntimes } from './runtimes.js';
import { indexedDbStore } from './store.js';
import { browserWebAuthn } from './webauthn.js';

export { WebAuthnError } from './webauthn.js';

export interface BrowserPlatformOptions {
  /** The name of the IndexedDB database. */
  readonly namespace?: string;
}

// The quota of one `getRandomValues` call.
const RANDOM_CHUNK = 65_536;

/** The app bundle needs the `passportWasm` plugin. Call `loadRuntimes()` before you import a module that reaches the runtimes. */
export function browserPlatform(options: BrowserPlatformOptions = {}): Platform {
  const namespace = options.namespace ?? 'mn-passport';
  if (namespace === '') throw new TypeError('namespace is empty.');
  let loading: Promise<void> | undefined;
  return {
    http: fetchHttp,
    randomBytes(length) {
      const bytes = new Uint8Array(length);
      for (let at = 0; at < length; at += RANDOM_CHUNK) {
        crypto.getRandomValues(bytes.subarray(at, at + RANDOM_CHUNK));
      }
      return bytes;
    },
    loadRuntimes() {
      if (!loading) {
        loading = loadRuntimes();
        loading.catch(() => {
          loading = undefined;
        });
      }
      return loading;
    },
    store: indexedDbStore(namespace),
    webauthn: typeof PublicKeyCredential === 'function' ? browserWebAuthn : undefined,
  };
}
