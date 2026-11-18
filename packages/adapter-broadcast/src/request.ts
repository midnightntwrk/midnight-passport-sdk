import {
  CancelledError,
  type AbortSignalLike,
  type HttpRequest,
  type HttpResponse,
  type Platform,
} from '@midnight-ntwrk/mn-passport-core';
import { clearTimer, decodeUtf8, newAbortController, setTimer } from './host.js';

export type Answer =
  { readonly ok: true; readonly response: HttpResponse } | { readonly ok: false };

/**
 * One request, bounded by `timeoutMs`. An abort of `signal` rejects with
 * `CancelledError`. A network failure or the timeout is `{ ok: false }`.
 */
export function send(
  platform: Platform,
  request: Omit<HttpRequest, 'signal'>,
  signal: AbortSignalLike | undefined,
  timeoutMs: number,
): Promise<Answer> {
  if (signal?.aborted) return Promise.reject(new CancelledError('caller'));
  const controller = newAbortController();
  return new Promise<Answer>((resolve, reject) => {
    let done = false;
    const finish = (settle: () => void): void => {
      if (done) return;
      done = true;
      clearTimer(timer);
      signal?.removeEventListener('abort', onAbort);
      settle();
    };
    // The platform rejects an aborted request, but a wait must not depend on it.
    const onAbort = (): void => {
      controller.abort();
      finish(() => reject(new CancelledError('caller')));
    };
    const timer = setTimer(() => {
      controller.abort();
      finish(() => resolve({ ok: false }));
    }, timeoutMs);
    signal?.addEventListener('abort', onAbort);
    platform.http({ ...request, signal: controller.signal }).then(
      (response) => finish(() => resolve({ ok: true, response })),
      () => finish(() => resolve({ ok: false })),
    );
  });
}

/** Header names are matched without case. */
export function header(response: HttpResponse, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(response.headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}

// A body comes from the network, so callers check its shape field by field.
/** `undefined` when the body is not UTF-8 JSON. */
export function json(body: Uint8Array): unknown {
  try {
    return JSON.parse(decodeUtf8(body)) as unknown;
  } catch {
    return undefined;
  }
}

export function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) return undefined;
  return (value as Record<string, unknown>)[key];
}

const HEX = /^(?:[0-9a-fA-F]{2})+$/;

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/** `undefined` unless `text` is non-empty, even-length hex. */
export function fromHex(text: string): Uint8Array | undefined {
  if (!HEX.test(text)) return undefined;
  const bytes = new Uint8Array(text.length / 2);
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}
