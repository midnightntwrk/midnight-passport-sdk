import { PassportError } from '../passport-error.js';

export class CancelledError extends PassportError {
  readonly _tag = 'CancelledError';
  readonly code = 'CANCELLED';
  /** `user` when the user dismissed a prompt. */
  readonly by: 'caller' | 'user';

  constructor(by: 'caller' | 'user') {
    super(by === 'user' ? 'The user cancelled the prompt.' : 'The caller cancelled the call.');
    this.name = 'CancelledError';
    this.by = by;
  }
}

export class TimeoutError extends PassportError {
  readonly _tag = 'TimeoutError';
  readonly code = 'TIMEOUT';
  readonly afterMs: number;

  constructor(afterMs: number) {
    super(`No result after ${afterMs} ms.`);
    this.name = 'TimeoutError';
    this.afterMs = afterMs;
  }
}

/** Keeps no URL and no upstream text, so it is safe to log. */
export class NetworkError extends PassportError {
  readonly _tag = 'NetworkError';
  readonly code = 'NETWORK_FAILED';

  constructor() {
    super('The network request failed.');
    this.name = 'NetworkError';
  }
}

/** Read the entry again, merge, and write with the new revision. */
export class MetadataConflictError extends PassportError {
  readonly _tag = 'MetadataConflictError';
  readonly code = 'METADATA_CONFLICT';
  readonly namespace: string;

  constructor(namespace: string) {
    super(`The metadata entry "${namespace}" changed since it was read.`);
    this.name = 'MetadataConflictError';
    this.namespace = namespace;
  }
}

export class MetadataTooLargeError extends PassportError {
  readonly _tag = 'MetadataTooLargeError';
  readonly code = 'METADATA_TOO_LARGE';
  readonly bytes: number;
  readonly maxBytes: number;

  constructor(bytes: number, maxBytes: number) {
    super(`The metadata entry is ${bytes} bytes. The limit is ${maxBytes} bytes.`);
    this.name = 'MetadataTooLargeError';
    this.bytes = bytes;
    this.maxBytes = maxBytes;
  }
}
