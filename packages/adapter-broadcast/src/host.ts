import type { AbortSignalLike } from '@midnight-ntwrk/mn-passport-core';

interface AbortControllerLike {
  readonly signal: AbortSignalLike;
  abort(): void;
}

// The package compiles with no platform types. Every supported runtime has these globals.
interface Host {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  AbortController: new () => AbortControllerLike;
  URL: {
    parse(url: string): {
      readonly protocol: string;
      readonly hostname: string;
      readonly username: string;
      readonly password: string;
      readonly hash: string;
    } | null;
  };
  TextDecoder: new (
    label: 'utf-8',
    options: { readonly fatal: true },
  ) => { decode(bytes: Uint8Array): string };
}

const host = globalThis as typeof globalThis & Host;

// The handle is a number in browsers and an object in Node.js. Only `clearTimer` reads it.
export const setTimer = (callback: () => void, ms: number): unknown =>
  host.setTimeout(callback, ms);
export const clearTimer = (handle: unknown): void => host.clearTimeout(handle);
export const newAbortController = (): AbortControllerLike => new host.AbortController();

/** Throws on bytes that are not UTF-8. */
export const decodeUtf8 = (bytes: Uint8Array): string =>
  new host.TextDecoder('utf-8', { fatal: true }).decode(bytes);

// A host timer fires a longer delay at once.
const MAX_TIMER_MS = 2_147_483_647;

/** Throws `RangeError` unless `ms` is an integer from 0 to 2,147,483,647. */
export function checkMs(name: string, ms: number): number {
  if (!Number.isInteger(ms) || ms < 0 || ms > MAX_TIMER_MS) {
    throw new RangeError(`${name} must be an integer from 0 to ${MAX_TIMER_MS}.`);
  }
  return ms;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Throws `TypeError` unless `url` is `https:`, or `http:` on a loopback host, with no user info or fragment. */
export function checkUrl(name: string, url: string): string {
  const parsed = host.URL.parse(url);
  if (!parsed) throw new TypeError(`${name} is not a URL.`);
  const secure =
    parsed.protocol === 'https:' || (parsed.protocol === 'http:' && LOOPBACK.has(parsed.hostname));
  if (secure && !parsed.username && !parsed.password && !parsed.hash) return url;
  throw new TypeError(
    `${name} must be https:, or http: on a loopback host, with no user info or fragment.`,
  );
}
