import { PassportError } from '@midnight-ntwrk/mn-passport-core';

// A response body can echo the preimage, so no error keeps response text.

export class ProverBusyError extends PassportError {
  readonly _tag = 'ProverBusyError';
  readonly code = 'PROVER_BUSY';
  /** Wait at least this long before the next call. */
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(`The prover is busy. Try again after ${retryAfterMs} ms.`);
    this.name = 'ProverBusyError';
    this.retryAfterMs = retryAfterMs;
  }
}

export type ProverRejectedReason =
  'input' | 'unknown-key' | 'too-large' | 'undeclared-circuit' | 'verifier-key-mismatch';

/** Final: the same call fails again. */
export class ProverRejectedError extends PassportError {
  readonly _tag = 'ProverRejectedError';
  readonly code = 'PROVER_REJECTED';
  readonly reason: ProverRejectedReason;
  /** `undefined` when the adapter refused before any request. */
  readonly status: number | undefined;

  constructor(reason: ProverRejectedReason, status?: number) {
    super(
      status === undefined
        ? `The proof request was refused (${reason}).`
        : `The prover refused the request (${reason}, status ${status}).`,
    );
    this.name = 'ProverRejectedError';
    this.reason = reason;
    this.status = status;
  }
}

export class ProverUnavailableError extends PassportError {
  readonly _tag = 'ProverUnavailableError';
  readonly code = 'PROVER_UNAVAILABLE';
  /** `undefined` after a network failure. */
  readonly status: number | undefined;

  constructor(status?: number) {
    super(
      status === undefined
        ? 'The prover could not be reached.'
        : `The prover is not available (status ${status}).`,
    );
    this.name = 'ProverUnavailableError';
    this.status = status;
  }
}

/** Final for this credential. */
export class ProverUnauthorizedError extends PassportError {
  readonly _tag = 'ProverUnauthorizedError';
  readonly code = 'PROVER_UNAUTHORIZED';
  readonly status: 401 | 403;

  constructor(status: 401 | 403) {
    super(`The prover refused the credential (status ${status}).`);
    this.name = 'ProverUnauthorizedError';
    this.status = status;
  }
}
