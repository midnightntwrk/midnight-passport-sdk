// WebAuthn helpers for the ROR experiment. The RP ID is ALWAYS the Passport
// domain — nightfi.test exercising it is exactly the Related Origin Request
// this experiment exists to validate. The largeBlob extension carries the
// "attached information" leg: data stored with the credential itself.

export const RP_ID = 'midnightpassport.test';
export const PRF_SALT = new TextEncoder().encode('mn-passport/prf-experiment/v1');

// The DOM lib does not yet type the PRF/largeBlob extensions; these local
// shapes keep the code fully typed without `any`.
interface CreateExtensionInputs {
  prf: { eval: { first: BufferSource } };
  largeBlob: { support: 'preferred' | 'required' };
}
interface GetExtensionInputs {
  prf: { eval: { first: BufferSource } };
  largeBlob?: { read?: boolean; write?: BufferSource };
}
interface ExtensionOutputs {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
  largeBlob?: { supported?: boolean; blob?: ArrayBuffer; written?: boolean };
}

export interface CreateResult {
  credential: PublicKeyCredential;
  prfEnabled: boolean;
  prfAtCreate: Uint8Array | null;
  largeBlobSupported: boolean;
}

export interface AssertOptions {
  allowCredentialId?: BufferSource;
  writeBlob?: BufferSource; // requires allowCredentialId (spec: exactly one)
  readBlob?: boolean;
}

export interface AssertResult {
  credential: PublicKeyCredential;
  prfOutput: Uint8Array | null;
  blob: Uint8Array | null;
  blobWritten: boolean | null; // null when no write was requested
}

export async function createPassportPasskey(username: string): Promise<CreateResult> {
  const extensions: CreateExtensionInputs = {
    prf: { eval: { first: PRF_SALT } },
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
        requireResidentKey: true,
        userVerification: 'required',
      },
      extensions,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error('credential creation returned null');
  const ext = credential.getClientExtensionResults() as ExtensionOutputs;
  return {
    credential,
    prfEnabled: ext.prf?.enabled ?? Boolean(ext.prf?.results?.first),
    prfAtCreate: ext.prf?.results?.first ? new Uint8Array(ext.prf.results.first) : null,
    largeBlobSupported: ext.largeBlob?.supported ?? false,
  };
}

export async function getPrfAssertion(options: AssertOptions = {}): Promise<AssertResult> {
  const extensions: GetExtensionInputs = { prf: { eval: { first: PRF_SALT } } };
  if (options.writeBlob) extensions.largeBlob = { write: options.writeBlob };
  else if (options.readBlob) extensions.largeBlob = { read: true };
  const credential = (await navigator.credentials.get({
    publicKey: {
      rpId: RP_ID,
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      userVerification: 'required',
      allowCredentials: options.allowCredentialId
        ? [{ type: 'public-key', id: options.allowCredentialId }]
        : [],
      extensions,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error('assertion returned null');
  const ext = credential.getClientExtensionResults() as ExtensionOutputs;
  return {
    credential,
    prfOutput: ext.prf?.results?.first ? new Uint8Array(ext.prf.results.first) : null,
    blob: ext.largeBlob?.blob ? new Uint8Array(ext.largeBlob.blob) : null,
    blobWritten: options.writeBlob ? (ext.largeBlob?.written ?? false) : null,
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
