import type { LocalStore } from '@midnight-ntwrk/mn-passport-core';
import { VERIFIER_KEY_HEX } from './fixtures/verifier-key.js';

export const verifierKey = async (): Promise<Uint8Array> => Buffer.from(VERIFIER_KEY_HEX, 'hex');

export function memoryStore(): LocalStore {
  const entries = new Map<string, Uint8Array>();
  return {
    get: async (key) => entries.get(key),
    set: async (key, value) => void entries.set(key, value),
    delete: async (key) => void entries.delete(key),
    keys: async () => [...entries.keys()],
    wipe: async () => entries.clear(),
  };
}
