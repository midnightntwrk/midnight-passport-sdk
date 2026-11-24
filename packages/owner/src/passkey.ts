import {
  CancelledError,
  RefusalError,
  checkP256Assertion,
  isProfileOrigin,
  p256KeyFromSpki,
  p256SignatureFromDer,
  webauthnChallenge,
  webauthnPolicy,
  type Authorization,
  type CallOptions,
  type KeyProvider,
  type Platform,
  type WebAuthn,
  type WebAuthnCreated,
  type WebAuthnPrfValues,
} from '@midnight-ntwrk/mn-passport-core';

export type PasskeyReason =
  'no-webauthn' | 'origin-rule' | 'origin' | 'cross-origin' | 'client-data' | 'public-key';

/** The account contract cannot use a passkey here, so the SDK stops before a wasted proof. */
export class PasskeyError extends RefusalError {
  static {
    this.prototype.name = 'PasskeyError';
  }

  readonly _tag = 'PasskeyError' as const;
  readonly code = 'PASSKEY_REFUSED' as const;
  readonly action = 'stop' as const;
  readonly reason: PasskeyReason;

  constructor(reason: PasskeyReason) {
    super(`The passkey cannot sign for the account contract: ${reason}.`);
    this.reason = reason;
  }
}

export interface PasskeySite {
  readonly platform: Platform;
  readonly rpId: string;
  /** The page origin, `location.origin`. The SDK cannot read it. */
  readonly origin: string;
  /** From the binding of the pinned contract build. */
  readonly originLength: number;
}

export interface Passkey {
  readonly credentialId: Uint8Array;
  /** 64 bytes, `x` then `y`, big-endian. */
  readonly publicKey: Uint8Array;
  /** The WebAuthn `user.id`, which the SDK draws at random. */
  readonly userId: Uint8Array;
}

export interface PasskeyPrf extends WebAuthnPrfValues {
  /** Without UV, some authenticators use another PRF secret. */
  readonly userVerified: boolean;
}

export interface CreatedPasskey {
  readonly passkey: Passkey;
  /** Secret: the caller zeros it. `undefined` where the authenticator gives PRF only on a get. */
  readonly prf: PasskeyPrf | undefined;
}

// Runs before any prompt: the origin length, and the bytes that the contract can rebuild.
function passkeyWebAuthn(site: PasskeySite): WebAuthn {
  if (!isProfileOrigin(site.origin, site.originLength)) throw new PasskeyError('origin-rule');
  if (!site.platform.webauthn) throw new PasskeyError('no-webauthn');
  return site.platform.webauthn;
}

function createdKey(created: WebAuthnCreated, challenge: Uint8Array, origin: string): Uint8Array {
  checkCreated(created.clientDataJSON, challenge, origin);
  if (!created.publicKey) throw new PasskeyError('public-key');
  try {
    return p256KeyFromSpki(created.publicKey);
  } catch {
    throw new PasskeyError('public-key');
  }
}

function checkCreated(clientDataJSON: Uint8Array, challenge: Uint8Array, origin: string): void {
  let data: unknown;
  try {
    // The fields that the SDK reads are ASCII, so a byte-per-char decode is enough.
    data = JSON.parse(Array.from(clientDataJSON, (byte) => String.fromCharCode(byte)).join(''));
  } catch {
    throw new PasskeyError('client-data');
  }
  if (typeof data !== 'object' || data === null) throw new PasskeyError('client-data');
  const fields = data as Record<string, unknown>;
  if (fields.type !== 'webauthn.create' || fields.challenge !== webauthnChallenge(challenge)) {
    throw new PasskeyError('client-data');
  }
  if (fields.origin !== origin) throw new PasskeyError('origin');
  // A cross-origin iframe sets it. The contract accepts only `false`.
  if (fields.crossOrigin === true) throw new PasskeyError('cross-origin');
}

/**
 * Creates a discoverable ES256 passkey with one prompt. It checks the origin first, and the
 * created client data after, so a passkey that the contract cannot use fails here.
 */
export async function createPasskey(
  site: PasskeySite & {
    readonly rpName: string;
    readonly user: { readonly name: string; readonly displayName: string };
    /** The PRF `eval` inputs, read in the same prompt where the authenticator allows it. */
    readonly prf?: WebAuthnPrfValues;
  },
  options?: CallOptions,
): Promise<CreatedPasskey> {
  const webauthn = passkeyWebAuthn(site);
  const challenge = site.platform.randomBytes(32);
  // A random id, so a new passkey never replaces another passkey of the same user.
  const userId = site.platform.randomBytes(32);
  const created = await webauthn.create({
    rp: { id: site.rpId, name: site.rpName },
    user: { ...site.user, id: userId },
    challenge,
    ...(site.prf ? { prf: site.prf } : {}),
    ...(options?.signal ? { signal: options.signal } : {}),
  });
  let publicKey: Uint8Array;
  try {
    publicKey = createdKey(created, challenge, site.origin);
  } catch (error) {
    created.prf?.first.fill(0);
    created.prf?.second?.fill(0);
    throw error;
  }
  return {
    passkey: { credentialId: created.credentialId, publicKey, userId },
    prf: created.prf && { ...created.prf, userVerified: created.userVerified },
  };
}

export type PasskeyProvider = KeyProvider & { readonly scheme: 'p256' };

/**
 * Signs with one prompt for each call. An assertion that the contract would refuse rejects with
 * `AssertionProfileError` and is not asked for again: the next tap gives the same shape.
 */
export function passkeyProvider(
  site: PasskeySite & Pick<Passkey, 'credentialId' | 'publicKey'>,
): PasskeyProvider {
  const webauthn = passkeyWebAuthn(site);
  const policy = webauthnPolicy(site.rpId, site.origin);
  const publicKey = site.publicKey.slice();
  const credentialId = site.credentialId.slice();
  return {
    scheme: 'p256',
    publicKey(options) {
      if (options?.signal?.aborted) return Promise.reject(new CancelledError('caller'));
      return Promise.resolve(publicKey.slice());
    },
    async sign(challenge, options): Promise<Authorization> {
      // A bad challenge would cost a tap before the profile check fails.
      if (challenge.length !== 32) throw new RangeError('challenge must be 32 bytes.');
      const asserted = await webauthn.get({
        rpId: site.rpId,
        challenge,
        allowCredentialIds: [credentialId],
        ...(options?.signal ? { signal: options.signal } : {}),
      });
      const authorization = {
        scheme: 'p256' as const,
        signature: p256SignatureFromDer(asserted.signature),
        authenticatorData: asserted.authenticatorData,
        clientDataJSON: asserted.clientDataJSON,
      };
      checkP256Assertion(authorization, {
        challenge,
        publicKey,
        policy,
        originLength: site.originLength,
      });
      return authorization;
    },
  };
}
