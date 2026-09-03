// WebAuthn helpers for the ROR experiment. The RP ID is ALWAYS the Passport
// domain — nightfi.test exercising it is exactly the Related Origin Request
// this experiment exists to validate.
//
// Ceremony discipline — MINIMISED variant (2026/08/18):
//   The original flow ran one extension per ceremony (create + prf.eval get +
//   largeBlob.write get = three prompts) because real providers have been
//   observed dropping PRF or aborting when prf.eval and largeBlob are combined.
//   This variant deliberately BUNDLES extensions to cut the prompt count to the
//   spec floor, and treats a dropped PRF as a measured finding rather than a
//   reason to add a ceremony back:
//     - create() attempts prf.eval too, so a provider that returns PRF results
//       at registration needs no follow-up get() to derive the key;
//     - the single follow-up get() carries BOTH prf.eval and largeBlob.write
//       (largeBlob writes are illegal at create(), so this get() is the floor).
//   Net: onboarding is two prompts, sign-in is one.

export const RP_ID = 'midnightpassport.test';
export const PRF_SALT = new TextEncoder().encode('mn-passport/prf-experiment/v1');

// The DOM lib does not yet type the PRF/largeBlob extensions; these local
// shapes keep the code fully typed without `any`.
interface CreateExtensionInputs {
  prf: { eval?: { first: BufferSource } };
  largeBlob: { support: 'preferred' | 'required' };
}
interface ExtensionOutputs {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
  largeBlob?: { supported?: boolean; blob?: ArrayBuffer; written?: boolean };
}

export interface CreateResult {
  credential: PublicKeyCredential;
  prfEnabled: boolean;
  prfOutput: Uint8Array | null; // non-null if the provider evaluated PRF at create()
  largeBlobSupported: boolean;
}

export interface AssertResult {
  credential: PublicKeyCredential;
  prfOutput: Uint8Array | null;
  blob: Uint8Array | null;
  written: boolean | null;
}

function readOutputs(credential: PublicKeyCredential): ExtensionOutputs {
  return credential.getClientExtensionResults() as ExtensionOutputs;
}

/**
 * Registration — enable PRF (and opportunistically evaluate it in the same
 * gesture) and declare largeBlob support. One prompt.
 */
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
        userVerification: 'required',
      },
      extensions: extensions as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error('credential creation returned null');
  const ext = readOutputs(credential);
  return {
    credential,
    prfEnabled: ext.prf?.enabled ?? false,
    prfOutput: ext.prf?.results?.first ? new Uint8Array(ext.prf.results.first) : null,
    largeBlobSupported: ext.largeBlob?.supported ?? false,
  };
}

/**
 * One assertion carrying as many extensions as the caller needs — PRF eval
 * plus at most one largeBlob operation. The spec allows read XOR write per
 * ceremony, and a write needs an allowlist of exactly one credential; PRF eval
 * rides along in the same prompt.
 */
export async function assertBundled(opts: {
  prf?: boolean;
  largeBlobRead?: boolean;
  largeBlobWrite?: BufferSource;
  allowCredentialId?: BufferSource;
}): Promise<AssertResult> {
  // `unknown` values: the bundle is assembled field-by-field from the typed
  // shapes above, then cast once at the get() call; the experiment owns
  // narrowing this if it graduates (CLAUDE.md typing rule).
  const extensions: Record<string, unknown> = {};
  if (opts.prf) extensions.prf = { eval: { first: PRF_SALT } };
  if (opts.largeBlobWrite) extensions.largeBlob = { write: opts.largeBlobWrite };
  else if (opts.largeBlobRead) extensions.largeBlob = { read: true };

  const credential = (await navigator.credentials.get({
    publicKey: {
      rpId: RP_ID,
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      userVerification: 'required',
      allowCredentials: opts.allowCredentialId
        ? [{ type: 'public-key', id: opts.allowCredentialId }]
        : [],
      extensions: extensions as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error('assertion returned null');
  const ext = readOutputs(credential);
  return {
    credential,
    prfOutput: ext.prf?.results?.first ? new Uint8Array(ext.prf.results.first) : null,
    blob: ext.largeBlob?.blob ? new Uint8Array(ext.largeBlob.blob) : null,
    written: opts.largeBlobWrite ? (ext.largeBlob?.written ?? false) : null,
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
