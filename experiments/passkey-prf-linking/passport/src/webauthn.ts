// WebAuthn helpers for the Passport-alike side of the ROR experiment. Same RP
// ID as the credential was created under (this page's own origin), so these
// are ordinary same-origin assertions — no ROR here.
//
// Ceremony discipline — MINIMISED variant (2026/08/18): the original flow ran
// one extension per get() (largeBlob.read then prf.eval = two prompts) to hedge
// against providers that drop PRF when it is combined with largeBlob. This
// variant BUNDLES prf.eval and largeBlob.read into a single get() — one prompt
// — and reports a dropped PRF as a measured finding rather than adding a
// ceremony back.

export const RP_ID = 'midnightpassport.test';
export const PRF_SALT = new TextEncoder().encode('mn-passport/prf-experiment/v1');

interface ExtensionOutputs {
  prf?: { results?: { first?: ArrayBuffer } };
  largeBlob?: { blob?: ArrayBuffer };
}

export interface AssertResult {
  credential: PublicKeyCredential;
  prfOutput: Uint8Array | null;
  blob: Uint8Array | null;
}

/**
 * One assertion carrying PRF eval and largeBlob read together — derive the key
 * and read the attached contract address in a single prompt.
 */
export async function assertBundled(allowCredentialId?: BufferSource): Promise<AssertResult> {
  const extensions = {
    prf: { eval: { first: PRF_SALT } },
    largeBlob: { read: true },
  };
  const credential = (await navigator.credentials.get({
    publicKey: {
      rpId: RP_ID,
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      userVerification: 'required',
      allowCredentials: allowCredentialId
        ? [{ type: 'public-key', id: allowCredentialId }]
        : [],
      extensions: extensions as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error('assertion returned null');
  const ext = credential.getClientExtensionResults() as ExtensionOutputs;
  return {
    credential,
    prfOutput: ext.prf?.results?.first ? new Uint8Array(ext.prf.results.first) : null,
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
