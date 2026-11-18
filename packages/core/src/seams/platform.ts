import type { AbortSignalLike } from './common.js';

export interface HttpRequest {
  readonly url: string;
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: Uint8Array | string;
  /** An abort rejects with `CancelledError`. For a deadline, pass `AbortSignal.timeout(ms)`. */
  readonly signal?: AbortSignalLike;
}

export interface HttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array;
}

/**
 * Not encrypted: never store a secret or private state in it. A key over 120
 * UTF-8 bytes rejects with `TypeError`.
 */
export interface LocalStore {
  get(key: string): Promise<Uint8Array | undefined>;
  set(key: string, value: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<readonly string[]>;
  /** Removes every entry that the SDK stored. */
  wipe(): Promise<void>;
}

export interface WebAuthnCreateOptions {
  readonly rp: { readonly id: string; readonly name: string };
  readonly user: { readonly id: Uint8Array; readonly name: string; readonly displayName: string };
  readonly challenge: Uint8Array;
  readonly excludeCredentialIds?: readonly Uint8Array[];
  readonly timeoutMs?: number;
  readonly signal?: AbortSignalLike;
}

export interface WebAuthnCreated {
  readonly credentialId: Uint8Array;
  readonly clientDataJSON: Uint8Array;
  readonly attestationObject: Uint8Array;
  /** DER SPKI, when the platform gives it. */
  readonly publicKey: Uint8Array | undefined;
}

export interface WebAuthnGetOptions {
  readonly rpId: string;
  readonly challenge: Uint8Array;
  readonly allowCredentialIds?: readonly Uint8Array[];
  readonly timeoutMs?: number;
  readonly signal?: AbortSignalLike;
}

export interface WebAuthnAssertion {
  readonly credentialId: Uint8Array;
  readonly clientDataJSON: Uint8Array;
  readonly authenticatorData: Uint8Array;
  readonly signature: Uint8Array;
  readonly userHandle: Uint8Array | undefined;
}

/** A dismissed prompt rejects with `CancelledError` (`by: 'user'`). */
export interface WebAuthn {
  create(options: WebAuthnCreateOptions): Promise<WebAuthnCreated>;
  get(options: WebAuthnGetOptions): Promise<WebAuthnAssertion>;
}

export interface Platform {
  /**
   * Does not follow a redirect. A redirect or a network failure rejects with
   * `NetworkError`. Any other status resolves.
   */
  http(request: HttpRequest): Promise<HttpResponse>;
  /** From the platform's cryptographic random source. */
  randomBytes(length: number): Uint8Array;
  /** Idempotent. */
  loadRuntimes(): Promise<void>;
  readonly store: LocalStore;
  /** `undefined` where the platform has no WebAuthn. */
  readonly webauthn: WebAuthn | undefined;
}
