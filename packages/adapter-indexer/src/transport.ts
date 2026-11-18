import {
  CancelledError,
  IndexerUnreachableError,
  type AbortSignalLike,
  type CallOptions,
  type HttpRequest,
  type HttpResponse,
} from '@midnight-ntwrk/mn-passport-core';
import { clearTimer, decodeUtf8, setTimer } from './globals.js';

export interface Endpoint {
  readonly url: string;
  readonly http: (request: HttpRequest) => Promise<HttpResponse>;
  readonly timeoutMs: number;
}

// The body is already in memory here, so the limit only stops the parse.
const MAX_BODY_BYTES = 16 * 1024 * 1024;

/** Parsed JSON that is not checked yet. Each reader checks its own fields. */
export type Data = Readonly<Record<string, unknown>>;

export const isRecord = (value: unknown): value is Data =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export interface OwnSignal {
  readonly signal: AbortSignalLike;
  abort(): void;
  /** Stops following the parent. */
  dispose(): void;
}

/** Aborts with `parent`, or on `abort()`. */
export function ownSignal(parent?: AbortSignalLike): OwnSignal {
  const listeners = new Set<() => void>();
  const signal = {
    aborted: false,
    addEventListener: (_type: 'abort', listener: () => void) => void listeners.add(listener),
    removeEventListener: (_type: 'abort', listener: () => void) => void listeners.delete(listener),
  };
  const abort = (): void => {
    if (signal.aborted) return;
    signal.aborted = true;
    for (const listener of [...listeners]) listener();
  };
  if (parent?.aborted) abort();
  else parent?.addEventListener('abort', abort);
  return { signal, abort, dispose: () => parent?.removeEventListener('abort', abort) };
}

function readJson(response: HttpResponse): Data {
  if (response.status < 200 || response.status > 299) throw new IndexerUnreachableError('status');
  if (response.body.length > MAX_BODY_BYTES) throw new IndexerUnreachableError('response');
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeUtf8(response.body));
  } catch {
    throw new IndexerUnreachableError('response');
  }
  if (!isRecord(parsed)) throw new IndexerUnreachableError('response');
  return parsed;
}

/**
 * A caller abort rejects with `CancelledError`, also after the request started. Every other
 * failure rejects with `IndexerUnreachableError`. The node read catches this error and does not
 * pass it on.
 */
export function postJson(endpoint: Endpoint, body: Data, options?: CallOptions): Promise<Data> {
  const caller = options?.signal;
  if (caller?.aborted) return Promise.reject(new CancelledError('caller'));
  return new Promise<Data>((resolve, reject) => {
    const request = ownSignal();
    let settled = false;
    const settle = (outcome: () => void, abortRequest: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimer(timer);
      caller?.removeEventListener('abort', onAbort);
      if (abortRequest) request.abort();
      outcome();
    };
    const onAbort = (): void => settle(() => reject(new CancelledError('caller')), true);
    const timer = setTimer(
      () => settle(() => reject(new IndexerUnreachableError('timeout')), true),
      endpoint.timeoutMs,
    );
    caller?.addEventListener('abort', onAbort);
    // A sync throw from `http` also takes the network path.
    new Promise<HttpResponse>((sent) =>
      sent(
        endpoint.http({
          url: endpoint.url,
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(body),
          signal: request.signal,
        }),
      ),
    ).then(
      (response) =>
        settle(() => {
          try {
            resolve(readJson(response));
          } catch (error) {
            reject(error);
          }
        }, false),
      () => settle(() => reject(new IndexerUnreachableError('network')), false),
    );
  });
}
