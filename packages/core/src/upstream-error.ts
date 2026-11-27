import { PassportError } from './passport-error.js';

// Upstream errors and their text can hold keys or private data, so only a short
// identifier passes. A long hex string can be a key.
const IDENTIFIER = /^[A-Za-z0-9_.:-]{1,48}$/;
const HEX = /^(0x)?[0-9a-f]{32,}$/i;
const identifier = (value: string | undefined): string | undefined =>
  value !== undefined && IDENTIFIER.test(value) && !HEX.test(value) ? value : undefined;

// Outside the error, so no view of the error shows the cause.
const causes = new WeakMap<UpstreamError, unknown>();
let keepCauses = false;

/**
 * A failure that midnight-js, compact-js, or the wallet SDK reported. It holds
 * no upstream object and no upstream text. Only `causeOf` gives a kept cause.
 */
export class UpstreamError extends PassportError {
  readonly _tag = 'UpstreamError';
  readonly code = 'UPSTREAM_FAILED';
  /** The upstream `_tag`, `name`, or class name, else `unknown`. */
  readonly sourceTag: string;
  /** The midnight-js error code, when it has one. */
  readonly sourceCode: string | undefined;

  constructor(source: {
    readonly sourceTag?: string | undefined;
    readonly sourceCode?: string | undefined;
    readonly cause?: unknown;
  }) {
    const sourceTag = identifier(source.sourceTag) ?? 'unknown';
    super(`An upstream call failed (${sourceTag}).`);
    this.name = 'UpstreamError';
    this.sourceTag = sourceTag;
    this.sourceCode = identifier(source.sourceCode);
    if (keepCauses) causes.set(this, source.cause);
  }

  /** For local debugging only. The errors made while it is on keep the upstream cause, which can hold keys. */
  static keepCauses(keep: boolean): void {
    keepCauses = keep;
  }

  /** The upstream cause, of the upstream type, or `undefined` when `keepCauses` was off as the error was made. */
  static causeOf(error: UpstreamError): unknown {
    return causes.get(error);
  }
}
