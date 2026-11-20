// The foundation has no platform types, so `AbortSignal` is not in scope.
export interface AbortSignalLike {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

/** An abort rejects the call with `CancelledError`. For a deadline, pass `AbortSignal.timeout(ms)`. */
export interface CallOptions {
  readonly signal?: AbortSignalLike;
}

/** Lowercase hex. */
export type ContractAddress = string;

/** Lowercase hex. */
export type TransactionId = string;

export interface BlockRef {
  readonly height: number;
  readonly hash: string;
}
