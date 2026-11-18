import { PassportError } from './passport-error.js';

export type RefusalAction = 'retry' | 'rebuild' | 'stop';

export abstract class RefusalError extends PassportError {
  abstract readonly action: RefusalAction;
}

export class SponsorBusyError extends RefusalError {
  static {
    this.prototype.name = 'SponsorBusyError';
  }

  readonly _tag = 'SponsorBusyError' as const;
  readonly code = 'SPONSOR_BUSY' as const;
  readonly action = 'retry' as const;
  readonly status: number;
  /** From the sponsor's `Retry-After`, when it sends one. */
  readonly retryAfterMs: number | undefined;

  constructor(status: number, retryAfterMs: number | undefined) {
    super('The sponsor is busy.');
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export class SponsorOverCapError extends RefusalError {
  static {
    this.prototype.name = 'SponsorOverCapError';
  }

  readonly _tag = 'SponsorOverCapError' as const;
  readonly code = 'SPONSOR_OVER_CAP' as const;
  readonly action = 'stop' as const;
  readonly status: number;

  constructor(status: number) {
    super('The fee is over the sponsor cap.');
    this.status = status;
  }
}

export class SponsorNotAllowedError extends RefusalError {
  static {
    this.prototype.name = 'SponsorNotAllowedError';
  }

  readonly _tag = 'SponsorNotAllowedError' as const;
  readonly code = 'SPONSOR_NOT_ALLOWED' as const;
  readonly action = 'stop' as const;
  readonly status: number;

  constructor(status: number) {
    super('The sponsor does not pay for this transaction.');
    this.status = status;
  }
}

export class SponsorCallerLimitError extends RefusalError {
  static {
    this.prototype.name = 'SponsorCallerLimitError';
  }

  readonly _tag = 'SponsorCallerLimitError' as const;
  readonly code = 'SPONSOR_CALLER_LIMIT' as const;
  readonly action = 'stop' as const;
  readonly status: number;
  readonly retryAfterMs: number | undefined;

  constructor(status: number, retryAfterMs: number | undefined) {
    super('The caller reached the sponsor limit.');
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export class SponsorUnavailableError extends RefusalError {
  static {
    this.prototype.name = 'SponsorUnavailableError';
  }

  readonly _tag = 'SponsorUnavailableError' as const;
  readonly code = 'SPONSOR_UNAVAILABLE' as const;
  readonly action: 'retry' | 'stop';
  /** Absent when no answer or no valid status came back. */
  readonly status: number | undefined;

  constructor(action: 'retry' | 'stop', status: number | undefined) {
    super('The sponsor is unavailable.');
    this.action = action;
    this.status = status;
  }
}

export type NodeRefusalReason =
  | 'expired-intent'
  | 'dust-proof-refused'
  | 'dust-double-spend'
  | 'stale-state'
  | 'fee-too-low'
  | 'over-block-limit'
  | 'unknown';

export class NodeRefusedError extends RefusalError {
  static {
    this.prototype.name = 'NodeRefusedError';
  }

  readonly _tag = 'NodeRefusedError' as const;
  readonly code = 'NODE_REFUSED' as const;
  readonly action: 'rebuild' | 'stop';
  readonly reason: NodeRefusalReason;
  /** Absent when the message has no valid custom code. */
  readonly nodeCode: number | undefined;
  /** Whether the refusal needs a new proof; `false` on a stop. */
  readonly newProof: boolean;

  constructor(rule: NodeRule, nodeCode: number | undefined) {
    super('The node refused the transaction.');
    this.action = rule.action;
    this.reason = rule.reason;
    this.newProof = rule.newProof;
    this.nodeCode = nodeCode;
  }
}

export type SponsorRefusal =
  | SponsorBusyError
  | SponsorOverCapError
  | SponsorNotAllowedError
  | SponsorCallerLimitError
  | SponsorUnavailableError;

export interface SponsorAnswer {
  /** Absent when no answer came back. */
  readonly status?: number;
  /** The `reason` field of the error body, when it has one. */
  readonly reason?: string;
  readonly retryAfterMs?: number;
}

/** `undefined` for a 2xx answer. */
export function sponsorRefusal(answer: SponsorAnswer): SponsorRefusal | undefined {
  const { status } = answer;
  // The fields can come from an untyped body, so only plain numbers go into an error.
  const retryAfterMs = isWait(answer.retryAfterMs) ? answer.retryAfterMs : undefined;
  if (status === undefined) return new SponsorUnavailableError('retry', undefined);
  if (!Number.isInteger(status)) return new SponsorUnavailableError('stop', undefined);
  if (status >= 200 && status < 300) return undefined;
  if (status === 503) return new SponsorBusyError(status, retryAfterMs);
  if (status === 429) return new SponsorCallerLimitError(status, retryAfterMs);
  if (status === 422 && answer.reason === 'over-fee-cap') return new SponsorOverCapError(status);
  // A proxy or gateway answers these, so the sponsor itself can still be up.
  if (status === 502 || status === 504) return new SponsorUnavailableError('retry', status);
  if (status >= 500) return new SponsorUnavailableError('stop', status);
  return new SponsorNotAllowedError(status);
}

function isWait(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

interface NodeRule {
  readonly reason: NodeRefusalReason;
  readonly action: 'rebuild' | 'stop';
  readonly newProof: boolean;
}

const EXPIRED_INTENT: NodeRule = { reason: 'expired-intent', action: 'rebuild', newProof: true };
const OVER_BLOCK_LIMIT: NodeRule = { reason: 'over-block-limit', action: 'stop', newProof: false };
const UNKNOWN: NodeRule = { reason: 'unknown', action: 'stop', newProof: false };

// Codes of midnight-node 2.1.101. Codes change between node versions.
const NODE_RULES: ReadonlyMap<number, NodeRule> = new Map([
  [228, EXPIRED_INTENT],
  [242, EXPIRED_INTENT],
  [170, { reason: 'dust-proof-refused', action: 'rebuild', newProof: false }],
  [196, { reason: 'dust-double-spend', action: 'rebuild', newProof: false }],
  [104, { reason: 'stale-state', action: 'rebuild', newProof: true }],
  [138, { reason: 'fee-too-low', action: 'stop', newProof: false }],
  [232, OVER_BLOCK_LIMIT],
]);

const CUSTOM_CODE = /Custom error: (\d{1,3})(?![\dA-Za-z])/;
// The node sends a custom code as a u8.
const MAX_NODE_CODE = 255;

function nodeCode(message: string): number | undefined {
  const digits = CUSTOM_CODE.exec(message)?.[1];
  if (digits === undefined) return undefined;
  const code = Number(digits);
  return code <= MAX_NODE_CODE ? code : undefined;
}

/** Takes the messages of the error chain, outer first. `undefined` when the node already holds the transaction. */
export function nodeRefusal(messages: readonly string[]): NodeRefusedError | undefined {
  if (messages.some((message) => message.includes('Transaction Already Imported')))
    return undefined;
  for (const message of messages) {
    const code = nodeCode(message);
    if (code !== undefined) return new NodeRefusedError(NODE_RULES.get(code) ?? UNKNOWN, code);
    // The weight check answers 1010 with this text and no custom code.
    if (message.includes('would exhaust the block limits')) {
      return new NodeRefusedError(OVER_BLOCK_LIMIT, undefined);
    }
  }
  return new NodeRefusedError(UNKNOWN, undefined);
}
