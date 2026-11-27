import { PassportError } from './passport-error.js';

/**
 * The payment can no longer land, so a new payment is safe. `sent` is `false`
 * when no send was made before `submitBy`.
 */
export class PaymentExpiredError extends PassportError {
  static {
    this.prototype.name = 'PaymentExpiredError';
  }

  readonly _tag = 'PaymentExpiredError' as const;
  readonly code = 'PAYMENT_EXPIRED' as const;
  readonly sent: boolean;

  constructor(sent: boolean) {
    super(
      sent ? 'The payment expired, and no block holds it.' : 'The payment expired before its send.',
    );
    this.sent = sent;
  }
}

/** The proof's own ttl has passed, so no payment of it can land. Build and prove again. */
export class ProofExpiredError extends PassportError {
  static {
    this.prototype.name = 'ProofExpiredError';
  }

  readonly _tag = 'ProofExpiredError' as const;
  readonly code = 'PROOF_EXPIRED' as const;

  constructor() {
    super('The proof expired before its payment.');
  }
}
