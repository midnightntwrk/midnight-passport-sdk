import { RefusalError } from '../refusals.js';

/** Read the account state again, build a new challenge, and sign it. */
export class StaleNonceError extends RefusalError {
  static {
    this.prototype.name = 'StaleNonceError';
  }

  readonly _tag = 'StaleNonceError' as const;
  readonly code = 'AUTH_NONCE_STALE' as const;
  readonly action = 'rebuild' as const;
  readonly signed: bigint;
  readonly current: bigint;

  constructor(signed: bigint, current: bigint) {
    super(`The challenge covers auth_nonce ${signed}, but the account is at ${current}.`);
    this.signed = signed;
    this.current = current;
  }
}

/**
 * Run it after the signature and before the proof request. The contract refuses a stale nonce
 * with the same error as a bad signature.
 */
export function assertFresh(
  challenge: { readonly authNonce: bigint },
  currentAuthNonce: bigint,
): void {
  if (challenge.authNonce !== currentAuthNonce) {
    throw new StaleNonceError(challenge.authNonce, currentAuthNonce);
  }
}
