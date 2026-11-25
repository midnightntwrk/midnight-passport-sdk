import {
  CancelledError,
  NetworkError,
  type AbortSignalLike,
  type HttpRequest,
  type HttpResponse,
  type Platform,
  type WebAuthn,
} from '@midnight-ntwrk/mn-passport-core';
import { inFlight } from '../abort.js';

export type HttpHandler = (request: HttpRequest) => Promise<HttpResponse>;

export interface StubPlatformOptions {
  /** Answers each request. By default each request rejects, so a request that a test does not expect fails it. */
  readonly http?: HttpHandler;
  /** Gives a WebAuthn of filler bytes. By default `webauthn` is `undefined`, as in Node.js. */
  readonly webauthn?: boolean;
}

export type StubPlatform = Platform & {
  /** Each request that reached `http`, in order. An aborted request is in it too. */
  readonly requests: readonly HttpRequest[];
  /** Each later request goes to `handler`. */
  answer(handler: HttpHandler): void;
  /** Each later `loadRuntimes` rejects with `error`. */
  loadFails(error: Error): void;
  /** Each later `loadRuntimes` never settles. */
  loadHangs(): void;
  /** The next WebAuthn prompt acts as if the user dismissed it. */
  dismissNextPrompt(): void;
};

const checkKey = (key: string): string => {
  if (new TextEncoder().encode(key).length > 120) throw new TypeError('The key is over 120 bytes.');
  return key;
};

const noRequest: HttpHandler = () =>
  Promise.reject(new Error('The stub platform got a request that the test does not expect.'));

/** `randomBytes` gives a counter, not random bytes. */
export function createStubPlatform(options: StubPlatformOptions = {}): StubPlatform {
  const entries = new Map<string, Uint8Array>();
  const requests: HttpRequest[] = [];
  let handler = options.http ?? noRequest;
  let load: 'ok' | 'hang' | Error = 'ok';
  let counter = 0;
  let dismiss = false;
  const prompt = <A>(signal: AbortSignalLike | undefined, answer: () => A): Promise<A> =>
    inFlight(signal, () => {
      if (!dismiss) return answer();
      dismiss = false;
      throw new CancelledError('user');
    });
  const bytes = (length: number) => new Uint8Array(length);
  const webauthn: WebAuthn = {
    create: (o) =>
      prompt(o.signal, () => ({
        credentialId: bytes(16),
        clientDataJSON: bytes(1),
        attestationObject: bytes(1),
        publicKey: undefined,
        prf: undefined,
        userVerified: true,
      })),
    get: (o) =>
      prompt(o.signal, () => ({
        credentialId: bytes(16),
        clientDataJSON: bytes(1),
        authenticatorData: bytes(37),
        signature: bytes(64),
        userHandle: undefined,
        prf: undefined,
        userVerified: true,
      })),
  };
  return {
    requests,
    async http(request) {
      requests.push(request);
      const response = await inFlight(request.signal, () => handler(request));
      if (response.status >= 300 && response.status < 400) throw new NetworkError();
      return response;
    },
    randomBytes: (length) => Uint8Array.from({ length }, () => counter++ & 0xff),
    loadRuntimes: () =>
      load === 'ok'
        ? Promise.resolve()
        : load === 'hang'
          ? new Promise<void>(() => {})
          : Promise.reject(load),
    store: {
      get: async (key) => entries.get(checkKey(key))?.slice(),
      set: async (key, value) => void entries.set(checkKey(key), value.slice()),
      delete: async (key) => void entries.delete(checkKey(key)),
      keys: async () => [...entries.keys()],
      wipe: async () => entries.clear(),
    },
    webauthn: options.webauthn ? webauthn : undefined,
    answer(next) {
      handler = next;
    },
    loadFails(error) {
      load = error;
    },
    loadHangs() {
      load = 'hang';
    },
    dismissNextPrompt() {
      dismiss = true;
    },
  };
}
