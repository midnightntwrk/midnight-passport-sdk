// The package compiles with no platform types. Every supported runtime has these globals.
interface Globals {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  TextDecoder: new (
    label: 'utf-8',
    options: { readonly fatal: true },
  ) => { decode(bytes: Uint8Array): string };
}

const platform = globalThis as typeof globalThis & Globals;

// The handle is a number in browsers and an object in Node.js. Only `clearTimer` reads it.
export const setTimer = (callback: () => void, ms: number): unknown =>
  platform.setTimeout(callback, ms);
export const clearTimer = (handle: unknown): void => platform.clearTimeout(handle);

/** Throws on bytes that are not UTF-8. */
export const decodeUtf8 = (bytes: Uint8Array): string =>
  new platform.TextDecoder('utf-8', { fatal: true }).decode(bytes);
