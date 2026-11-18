import {
  CancelledError,
  NetworkError,
  PassportError,
  TimeoutError,
  type AbortSignalLike,
  type HttpResponse,
  type Platform,
} from '@midnight-ntwrk/mn-passport-core';
import {
  ProverBusyError,
  ProverRejectedError,
  ProverUnauthorizedError,
  ProverUnavailableError,
} from './errors.js';

// A timer handle is a number in a browser and an object in Node.
export interface Clock {
  now(): number;
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

interface AbortControllerLike {
  readonly signal: AbortSignalLike;
  abort(): void;
}

// The package builds with no DOM or Node types, and the platform seam has no timer.
const host = globalThis as typeof globalThis & {
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  AbortController: new () => AbortControllerLike;
};

export const hostClock: Clock = {
  now: () => Date.now(),
  setTimeout: (run, ms) => host.setTimeout(run, ms),
  clearTimeout: (handle) => host.clearTimeout(handle),
};

// The largest delay that a host timer keeps; a longer one fires at once.
const MAX_TIMEOUT_MS = 2_147_483_647;

/** One `prove` call: the caller's signal and the deadline end it. */
export interface Call {
  readonly signal: AbortSignalLike;
  readonly deadlineAt: number;
  /** The error that ended the call, once it ended. */
  ended(): PassportError | undefined;
  /** Call it once the call settles. Work still in flight then rejects with `CancelledError`. */
  close(): void;
}

/** Throws `RangeError` unless `timeoutMs` is an integer from 0 to 2 147 483 647. */
export function openCall(
  signal: AbortSignalLike | undefined,
  timeoutMs: number,
  clock: Clock = hostClock,
): Call {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new RangeError(`The timeout must be an integer from 0 to ${MAX_TIMEOUT_MS} ms.`);
  }
  const controller = new host.AbortController();
  let reason: PassportError | undefined;
  const end = (error: PassportError): void => {
    if (reason !== undefined) return;
    reason = error;
    controller.abort();
  };
  const onAbort = (): void => end(new CancelledError('caller'));
  if (signal?.aborted) onAbort();
  signal?.addEventListener('abort', onAbort);
  const timer = clock.setTimeout(() => end(new TimeoutError(timeoutMs)), timeoutMs);
  return {
    signal: controller.signal,
    deadlineAt: clock.now() + timeoutMs,
    ended: () => reason,
    close() {
      clock.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      end(new CancelledError('caller'));
    },
  };
}

// Starts no work on an ended call. Rejects with the call's error once the call
// ends, even if the work never settles, and also when the work settles after it.
function untilEnded<A>(call: Call, start: () => Promise<A>): Promise<A> {
  return new Promise<A>((resolve, reject) => {
    const ended = call.ended();
    if (ended !== undefined) return reject(ended);
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- The signal aborts only after `ended()` holds the error.
    const onEnd = (): void => reject(call.ended());
    call.signal.addEventListener('abort', onEnd);
    const settle = (): PassportError | undefined => {
      call.signal.removeEventListener('abort', onEnd);
      return call.ended();
    };
    let work: Promise<A>;
    try {
      work = start();
    } catch (error) {
      settle();
      return reject(error);
    }
    work.then(
      (value) => {
        const ended = settle();
        if (ended === undefined) resolve(value);
        else reject(ended);
      },
      (error: unknown) => reject(settle() ?? error),
    );
  });
}

function sleep(call: Call, ms: number, clock: Clock): Promise<void> {
  return untilEnded(
    call,
    () =>
      new Promise<void>((resolve) => {
        const onAbort = (): void => clock.clearTimeout(timer);
        const timer = clock.setTimeout(() => {
          call.signal.removeEventListener('abort', onAbort);
          resolve();
        }, ms);
        call.signal.addEventListener('abort', onAbort);
      }),
  );
}

const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?(\/|$)/;
const SECURE = /^https:\/\/[^/?#@\s]+(\/|$)/;

/** Throws on a URL that is not `https:` or loopback `http:`, or has a query, fragment, or user. */
export function serviceUrl(url: string): string {
  if (/[?#@\s]/.test(url) || !(SECURE.test(url) || LOOPBACK.test(url))) {
    throw new TypeError('The prover URL must be https, or http on a loopback host.');
  }
  return url.replace(/\/+$/, '');
}

export interface Query {
  readonly key: string;
  /** Decimal. */
  readonly binding?: string;
}

export interface TransportOptions {
  readonly url: string;
  readonly platform: Pick<Platform, 'http'>;
  readonly credential?: () => Promise<string>;
  readonly clock?: Clock;
}

export type Transport = (
  route: 'check' | 'prove',
  query: Query,
  body: Uint8Array,
  call: Call,
) => Promise<Uint8Array>;

const RETRY_AFTER = /^\d{1,9}$/;
// A redirect also rejects with `NetworkError`. Each retry sends the preimage and a credential again.
const MAX_NETWORK_RETRIES = 2;
// A zero Retry-After would repeat the request with no pause until the deadline.
const MIN_WAIT_MS = 1000;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16_000];
const LAST_BACKOFF_MS = 30_000;

function retryAfterMs(response: HttpResponse): number | undefined {
  const entry = Object.entries(response.headers).find(
    ([name]) => name.toLowerCase() === 'retry-after',
  );
  // An HTTP date is not read, and the backoff applies.
  return entry !== undefined && RETRY_AFTER.test(entry[1].trim())
    ? Math.max(Number(entry[1].trim()) * 1000, MIN_WAIT_MS)
    : undefined;
}

type Outcome =
  | { readonly kind: 'done'; readonly body: Uint8Array }
  | { readonly kind: 'final'; readonly error: PassportError }
  | {
      readonly kind: 'retry';
      readonly busy: boolean;
      readonly status: number | undefined;
      readonly waitMs: number | undefined;
    };

function outcome(response: HttpResponse): Outcome {
  const { status } = response;
  if (status === 200) return { kind: 'done', body: response.body };
  if (status === 400 || status === 422) {
    return { kind: 'final', error: new ProverRejectedError('input', status) };
  }
  if (status === 404)
    return { kind: 'final', error: new ProverRejectedError('unknown-key', status) };
  if (status === 413) return { kind: 'final', error: new ProverRejectedError('too-large', status) };
  if (status === 401 || status === 403) {
    return { kind: 'final', error: new ProverUnauthorizedError(status) };
  }
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return { kind: 'retry', busy: status === 429, status, waitMs: retryAfterMs(response) };
  }
  return { kind: 'final', error: new ProverUnavailableError(status) };
}

/**
 * Throws as `serviceUrl` does. A rejection of `credential` rejects the request
 * with the same error. A network failure is retried twice at most.
 */
export function createTransport(options: TransportOptions): Transport {
  const base = serviceUrl(options.url);
  const clock = options.clock ?? hostClock;
  const { credential } = options;
  return async (route, query, body, call) => {
    let url = `${base}/${route}?key=${encodeURIComponent(query.key)}`;
    if (query.binding !== undefined) url += `&binding=${encodeURIComponent(query.binding)}`;
    for (let attempt = 0, networkFailures = 0; ; attempt++) {
      const headers: Record<string, string> = { 'content-type': 'application/octet-stream' };
      if (credential) headers.authorization = `Bearer ${await untilEnded(call, credential)}`;
      let result: Outcome;
      try {
        const response = await untilEnded(call, () =>
          options.platform.http({ url, method: 'POST', headers, body, signal: call.signal }),
        );
        result = outcome(response);
      } catch (error) {
        const ended = call.ended();
        if (ended !== undefined) throw ended;
        if (error instanceof CancelledError) throw error;
        // Any other platform error can echo a header, so it is not kept.
        if (!(error instanceof NetworkError) || ++networkFailures > MAX_NETWORK_RETRIES) {
          throw new ProverUnavailableError();
        }
        result = { kind: 'retry', busy: false, status: undefined, waitMs: undefined };
      }
      if (result.kind === 'done') return result.body;
      if (result.kind === 'final') throw result.error;
      const waitMs = result.waitMs ?? BACKOFF_MS[attempt] ?? LAST_BACKOFF_MS;
      if (clock.now() + waitMs > call.deadlineAt) {
        throw result.busy ? new ProverBusyError(waitMs) : new ProverUnavailableError(result.status);
      }
      await sleep(call, waitMs, clock);
    }
  };
}
