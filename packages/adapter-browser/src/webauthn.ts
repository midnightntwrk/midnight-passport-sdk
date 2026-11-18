import {
  CancelledError,
  PassportError,
  type AbortSignalLike,
  type WebAuthn,
  type WebAuthnPrfValues,
} from '@midnight-ntwrk/mn-passport-core';

/** `reason` is the DOM error name, such as `InvalidStateError`, or `No…` when the browser gives no usable credential. */
export class WebAuthnError extends PassportError {
  readonly _tag = 'WebAuthnError';
  readonly code = 'WEBAUTHN_FAILED';
  readonly reason: string;

  constructor(reason: string) {
    super(`The authenticator failed (${reason}).`);
    this.name = 'WebAuthnError';
    this.reason = reason;
  }
}

// ES256, the only algorithm that the p256 key arm verifies.
const ES256 = -7;

const bytes = (buffer: ArrayBuffer): Uint8Array => new Uint8Array(buffer.slice(0));
const descriptors = (ids: readonly Uint8Array[] = []): PublicKeyCredentialDescriptor[] =>
  ids.map((id) => ({ type: 'public-key', id: new Uint8Array(id) }));

const prfInputs = (values: WebAuthnPrfValues): AuthenticationExtensionsPRFValues =>
  values.second === undefined
    ? { first: new Uint8Array(values.first) }
    : { first: new Uint8Array(values.first), second: new Uint8Array(values.second) };

// No copy, so the adapter keeps no PRF output after the receiver zeros it.
const view = (source: BufferSource): Uint8Array =>
  ArrayBuffer.isView(source)
    ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    : new Uint8Array(source);

function prfResults(credential: PublicKeyCredential): WebAuthnPrfValues | undefined {
  const results = credential.getClientExtensionResults().prf?.results;
  if (results === undefined) return undefined;
  return results.second === undefined
    ? { first: view(results.first) }
    : { first: view(results.first), second: view(results.second) };
}

const UV = 0x04;
const userVerified = (authenticatorData: ArrayBuffer): boolean =>
  ((new Uint8Array(authenticatorData)[32] ?? 0) & UV) !== 0;

async function ceremony<A>(
  signal: AbortSignalLike | undefined,
  run: (signal: AbortSignal) => Promise<Credential | null>,
  read: (credential: PublicKeyCredential) => A,
): Promise<A> {
  if (signal?.aborted) throw new CancelledError('caller');
  const controller = new AbortController();
  const onAbort = (): void => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const credential = await run(controller.signal);
    // The browser can finish the ceremony after the abort.
    if (signal?.aborted) throw new CancelledError('caller');
    if (!(credential instanceof PublicKeyCredential)) throw new WebAuthnError('NoCredential');
    return read(credential);
  } catch (error) {
    if (signal?.aborted) throw new CancelledError('caller');
    if (error instanceof WebAuthnError) throw error;
    const name =
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      typeof error.name === 'string'
        ? error.name
        : 'UnknownError';
    // The browser gives `NotAllowedError` for a dismissed prompt and for a timeout alike.
    throw name === 'NotAllowedError' ? new CancelledError('user') : new WebAuthnError(name);
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

export const browserWebAuthn: WebAuthn = {
  create(options) {
    const publicKey: PublicKeyCredentialCreationOptions = {
      rp: options.rp,
      user: { ...options.user, id: new Uint8Array(options.user.id) },
      challenge: new Uint8Array(options.challenge),
      pubKeyCredParams: [{ type: 'public-key', alg: ES256 }],
      excludeCredentials: descriptors(options.excludeCredentialIds),
      authenticatorSelection: {
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'required',
      },
      attestation: 'none',
      // Some security keys turn PRF on only when the create asks for it.
      extensions: { prf: options.prf ? { eval: prfInputs(options.prf) } : {} },
    };
    if (options.timeoutMs !== undefined) publicKey.timeout = options.timeoutMs;
    return ceremony(
      options.signal,
      (signal) => navigator.credentials.create({ publicKey, signal }),
      (credential) => {
        const { response } = credential;
        if (!(response instanceof AuthenticatorAttestationResponse)) {
          throw new WebAuthnError('NoAttestation');
        }
        // A browser without `getPublicKey` has already stored the credential, so do not fail here.
        const publicKey =
          typeof response.getPublicKey === 'function' ? response.getPublicKey() : null;
        return {
          credentialId: bytes(credential.rawId),
          clientDataJSON: bytes(response.clientDataJSON),
          attestationObject: bytes(response.attestationObject),
          publicKey: publicKey ? bytes(publicKey) : undefined,
          prf: prfResults(credential),
          userVerified:
            typeof response.getAuthenticatorData === 'function' &&
            userVerified(response.getAuthenticatorData()),
        };
      },
    );
  },
  get(options) {
    const publicKey: PublicKeyCredentialRequestOptions = {
      rpId: options.rpId,
      challenge: new Uint8Array(options.challenge),
      allowCredentials: descriptors(options.allowCredentialIds),
      userVerification: 'required',
    };
    if (options.prf) publicKey.extensions = { prf: { eval: prfInputs(options.prf) } };
    if (options.timeoutMs !== undefined) publicKey.timeout = options.timeoutMs;
    return ceremony(
      options.signal,
      (signal) => navigator.credentials.get({ publicKey, signal }),
      (credential) => {
        const { response } = credential;
        if (!(response instanceof AuthenticatorAssertionResponse)) {
          throw new WebAuthnError('NoAssertion');
        }
        return {
          credentialId: bytes(credential.rawId),
          clientDataJSON: bytes(response.clientDataJSON),
          authenticatorData: bytes(response.authenticatorData),
          signature: bytes(response.signature),
          userHandle: response.userHandle ? bytes(response.userHandle) : undefined,
          prf: prfResults(credential),
          userVerified: userVerified(response.authenticatorData),
        };
      },
    );
  },
};
