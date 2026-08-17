// WebAuthn helpers for the ROR experiment. The RP ID is ALWAYS the Passport
// domain — nightfi.test exercising it is exactly the Related Origin Request
// this experiment exists to validate.

export const RP_ID = 'midnightpassport.test';
export const PRF_SALT = new TextEncoder().encode('mn-passport/prf-experiment/v1');

// The DOM lib does not yet type the PRF extension; these local shapes keep
// the code fully typed without `any`.
interface PrfEvalInputs {
  prf: { eval: { first: BufferSource } };
}
interface PrfOutputs {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
}

export interface CreateResult {
  credential: PublicKeyCredential;
  prfEnabled: boolean;
  prfAtCreate: Uint8Array | null;
}

export interface AssertResult {
  credential: PublicKeyCredential;
  prfOutput: Uint8Array | null;
}

export async function createPassportPasskey(username: string): Promise<CreateResult> {
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
      extensions: { prf: { eval: { first: PRF_SALT } } } as PrfEvalInputs,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error('credential creation returned null');
  const ext = credential.getClientExtensionResults() as PrfOutputs;
  return {
    credential,
    prfEnabled: ext.prf?.enabled ?? Boolean(ext.prf?.results?.first),
    prfAtCreate: ext.prf?.results?.first ? new Uint8Array(ext.prf.results.first) : null,
  };
}

export async function getPrfAssertion(allowCredentialId?: BufferSource): Promise<AssertResult> {
  const credential = (await navigator.credentials.get({
    publicKey: {
      rpId: RP_ID,
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      userVerification: 'required',
      allowCredentials: allowCredentialId
        ? [{ type: 'public-key', id: allowCredentialId }]
        : [],
      extensions: { prf: { eval: { first: PRF_SALT } } } as PrfEvalInputs,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error('assertion returned null');
  const ext = credential.getClientExtensionResults() as PrfOutputs;
  return {
    credential,
    prfOutput: ext.prf?.results?.first ? new Uint8Array(ext.prf.results.first) : null,
  };
}

export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(String.fromCharCode(...view))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}
