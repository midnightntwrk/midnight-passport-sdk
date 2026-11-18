import { PassportError } from './passport-error.js';

// Upstream errors and their text can hold keys or private data, so only a short
// identifier passes. A long hex string can be a key.
const IDENTIFIER = /^[A-Za-z0-9_.:-]{1,48}$/;
const HEX = /^(0x)?[0-9a-f]{32,}$/i;
const identifier = (value: string | undefined): string | undefined =>
  value !== undefined && IDENTIFIER.test(value) && !HEX.test(value) ? value : undefined;

/**
 * A failure that midnight-js, compact-js, or the wallet SDK reported. It keeps
 * no upstream object and no upstream text.
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
  }) {
    const sourceTag = identifier(source.sourceTag) ?? 'unknown';
    super(`An upstream call failed (${sourceTag}).`);
    this.name = 'UpstreamError';
    this.sourceTag = sourceTag;
    this.sourceCode = identifier(source.sourceCode);
  }
}
