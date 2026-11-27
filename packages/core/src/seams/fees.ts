import type { CallOptions } from './common.js';
import type { PaidTransaction, ProvenTransaction } from './transaction.js';

export interface Fees {
  /**
   * Call just before `Broadcast.submit`. Rejects with a sponsor refusal:
   * `SponsorBusyError`, `SponsorOverCapError`, `SponsorNotAllowedError`,
   * `SponsorCallerLimitError`, or `SponsorUnavailableError`.
   * Rejects with `ProofExpiredError`, before any request, when the proof's own
   * ttl has passed.
   */
  pay(tx: ProvenTransaction, options?: CallOptions): Promise<PaidTransaction>;
}
