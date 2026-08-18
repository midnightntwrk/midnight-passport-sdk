// WebAuthn helpers for the ROR experiment. The RP ID is ALWAYS the Passport
// domain — nightfi.test exercising it is exactly the Related Origin Request
// this experiment exists to validate.
//
// Ceremony discipline (mirrors the validated account-custody prototype,
// ../passport/experiments/account-custody-prototype):
//   - PRF is only ENABLED at create() (bare `prf: {}`); results are only
//     guaranteed during get().
//   - ONE extension per get() ceremony — real providers have been observed
//     dropping PRF or aborting outright when prf.eval and largeBlob are
//     combined in a single request.

export const RP_ID = 'midnightpassport.test';
export const PRF_SALT = new TextEncoder().encode('mn-passport/prf-experiment/v1');

// The DOM lib does not yet type the PRF/largeBlob extensions; these local
// shapes keep the code fully typed without `any`.
interface CreateExtensionInputs {
  prf: Record<string, never>;
  largeBlob: { support: 'preferred' | 'required' };
}
interface ExtensionOutputs {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
  largeBlob?: { supported?: boolean; blob?: ArrayBuffer; written?: boolean };
}

export interface CreateResult {
  credential: PublicKeyCredential;
  prfEnabled: boolean;
  largeBlobSupported: boolean;
}

async function assertOnce(
  extensions: AuthenticationExtensionsClientInputs,
  allowCredentialId?: BufferSource,
): Promise<PublicKeyCredential> {
  const credential = (await navigator.credentials.get({
    publicKey: {
      rpId: RP_ID,
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      userVerification: 'required',
      allowCredentials: allowCredentialId
        ? [{ type: 'public-key', id: allowCredentialId }]
        : [],
      extensions,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error('assertion returned null');
  return credential;
}

export async function createPassportPasskey(username: string): Promise<CreateResult> {
  const extensions: CreateExtensionInputs = {
    prf: {},
    largeBlob: { support: 'preferred' },
  };
  const credential = (await navigator.credentials.create({
    publicKey: {
      rp: { id: RP_ID, name: 'Midnight Passport (experiment)' },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: username,
        displayName: username,
      },
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256 / P-256
        { type: 'public-key', alg: -257 }, // RS256 fallback
      ],
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
      extensions,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error('credential creation returned null');
  const ext = credential.getClientExtensionResults() as ExtensionOutputs;
  return {
    credential,
    prfEnabled: ext.prf?.enabled ?? false,
    largeBlobSupported: ext.largeBlob?.supported ?? false,
  };
}

/** PRF evaluation — its own ceremony, no other extension. */
export async function evalPrf(
  allowCredentialId?: BufferSource,
): Promise<{ credential: PublicKeyCredential; prfOutput: Uint8Array | null }> {
  const credential = await assertOnce(
    { prf: { eval: { first: PRF_SALT } } } as AuthenticationExtensionsClientInputs,
    allowCredentialId,
  );
  const ext = credential.getClientExtensionResults() as ExtensionOutputs;
  return {
    credential,
    prfOutput: ext.prf?.results?.first ? new Uint8Array(ext.prf.results.first) : null,
  };
}

/** largeBlob write — its own ceremony; the spec requires an allowlist of one. */
export async function writeBlob(
  allowCredentialId: BufferSource,
  blob: BufferSource,
): Promise<{ credential: PublicKeyCredential; written: boolean }> {
  const credential = await assertOnce(
    { largeBlob: { write: blob } } as AuthenticationExtensionsClientInputs,
    allowCredentialId,
  );
  const ext = credential.getClientExtensionResults() as ExtensionOutputs;
  return { credential, written: ext.largeBlob?.written ?? false };
}

/** largeBlob read — its own ceremony. */
export async function readBlob(
  allowCredentialId?: BufferSource,
): Promise<{ credential: PublicKeyCredential; blob: Uint8Array | null }> {
  const credential = await assertOnce(
    { largeBlob: { read: true } } as AuthenticationExtensionsClientInputs,
    allowCredentialId,
  );
  const ext = credential.getClientExtensionResults() as ExtensionOutputs;
  return {
    credential,
    blob: ext.largeBlob?.blob ? new Uint8Array(ext.largeBlob.blob) : null,
  };
}

export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(String.fromCharCode(...view))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
