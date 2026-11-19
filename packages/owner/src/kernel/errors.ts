import { PassportError } from '@midnight-ntwrk/mn-passport-core';

/** Carries no handle and no secret, so it is safe to log. */
export class UnknownHandleError extends PassportError {
  readonly _tag = 'UnknownHandleError';
  readonly code = 'UNKNOWN_HANDLE';

  constructor() {
    super('The handle was already released, or this kernel never issued it.');
    this.name = 'UnknownHandleError';
  }
}
