import type {
  Binding,
  Intent,
  PreBinding,
  Proof,
  SignatureEnabled,
  Transaction,
} from '@midnightntwrk/ledger-v9';
import {
  CancelledError,
  ProofExpiredError,
  RefusalError,
  SponsorUnavailableError,
  sponsorRefusal,
  type Fees,
  type HttpResponse,
  type Platform,
  type SponsorAnswer,
} from '@midnight-ntwrk/mn-passport-core';
import { checkMs, checkUrl } from './host.js';
import { earliestTtl, loadLedger, type Ledger } from './ledger.js';
import { field, fromHex, header, json, send, toHex } from './request.js';

export interface SponsorFeesOptions {
  /** The sponsor endpoint. `https:`, or `http:` on a loopback host. */
  readonly url: string;
  readonly platform: Platform;
  /** How long a payment stays valid for the submit. Default: 50,000. */
  readonly paymentTtlMs?: number;
  /** Default: 30,000. */
  readonly requestTimeoutMs?: number;
}

// The Preview sponsor locks its fee coin for 60 s; the margin covers the submit.
const DEFAULT_PAYMENT_TTL_MS = 50_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const ID = /^(?:[0-9a-f]{2})+$/;

/** The sponsor's answer dropped or changed a part of the proven transaction. */
export class SponsorAlteredError extends RefusalError {
  static {
    this.prototype.name = 'SponsorAlteredError';
  }

  readonly _tag = 'SponsorAlteredError' as const;
  readonly code = 'SPONSOR_ALTERED' as const;
  readonly action = 'stop' as const;

  constructor() {
    super('The sponsor changed the transaction.');
  }
}

/**
 * Each call asks the sponsor once. `pay` throws `TypeError` for bytes that are
 * not proven and unbound. A bad `url` throws `TypeError`, and a bad duration
 * throws `RangeError`.
 */
export function sponsorFees(options: SponsorFeesOptions): Fees {
  const url = checkUrl('url', options.url);
  const { platform } = options;
  const paymentTtlMs = checkMs('paymentTtlMs', options.paymentTtlMs ?? DEFAULT_PAYMENT_TTL_MS);
  const requestTimeoutMs = checkMs(
    'requestTimeoutMs',
    options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
  );

  return {
    async pay(tx, callOptions) {
      const signal = callOptions?.signal;
      if (signal?.aborted) throw new CancelledError('caller');
      // The ledger loads before the request, so a load failure locks no fee coin.
      const ledger = await loadLedger(platform, signal, requestTimeoutMs);
      const proven = requireProven(ledger, tx.bytes);
      // No fee coin is locked for bytes that no ledger takes.
      if ((earliestTtl(proven.intents) ?? Number.POSITIVE_INFINITY) <= Date.now()) {
        throw new ProofExpiredError();
      }
      const startedAt = Date.now();
      const answer = await send(
        platform,
        {
          url,
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ provenTx: toHex(tx.bytes) }),
        },
        signal,
        requestTimeoutMs,
      );
      // No answer is a retry, as `sponsorRefusal` maps an answer with no status.
      if (!answer.ok) throw new SponsorUnavailableError('retry', undefined);
      const body = json(answer.response.body);
      const refusal = sponsorRefusal(sponsorAnswer(answer.response, body));
      if (refusal) throw refusal;
      const paid = readPaid(ledger, body, new Set(proven.identifiers()));
      if (!paid) throw new SponsorUnavailableError('stop', answer.response.status);
      if (!keepsProven(proven, paid.tx)) throw new SponsorAlteredError();
      // The sponsor's fee intent expires with its coin lock, so its ttl can come first.
      const ttl = earliestTtl(paid.tx.intents);
      const submitBy = Math.min(startedAt + paymentTtlMs, ttl ?? Number.POSITIVE_INFINITY);
      return { stage: 'paid', bytes: paid.bytes, id: paid.id, submitBy };
    },
  };
}

// An unproven transaction shows its private inputs to the sponsor.
function requireProven(
  ledger: Ledger,
  bytes: Uint8Array,
): Transaction<SignatureEnabled, Proof, PreBinding> {
  try {
    return ledger.Transaction.deserialize('signature', 'proof', 'pre-binding', bytes);
  } catch {
    throw new TypeError('The transaction is not a proven, unbound transaction.');
  }
}

function sponsorAnswer(response: HttpResponse, body: unknown): SponsorAnswer {
  const reason = field(body, 'reason');
  const retryAfterMs = retryAfter(header(response, 'retry-after'));
  return {
    status: response.status,
    ...(typeof reason === 'string' ? { reason } : {}),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  };
}

/** Seconds or an HTTP date. */
function retryAfter(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const text = value.trim();
  if (/^\d{1,9}$/.test(text)) return Number(text) * 1000;
  const at = Date.parse(text);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

// Every payment of one proof keeps the proof's identifiers, so the payment's
// own identifier is the one that the sponsor's fee intent adds.
function readPaid(ledger: Ledger, body: unknown, proven: ReadonlySet<string>) {
  const hex = field(body, 'tx');
  const bytes = typeof hex === 'string' ? fromHex(hex) : undefined;
  if (!bytes) return undefined;
  let tx: Transaction<SignatureEnabled, Proof, Binding>;
  try {
    tx = ledger.Transaction.deserialize('signature', 'proof', 'binding', bytes);
  } catch {
    return undefined;
  }
  const id = tx.identifiers().find((each) => !proven.has(each));
  return id !== undefined && ID.test(id) ? { bytes, id, tx } : undefined;
}

const sameOffer = (a: { serialize(): Uint8Array } | undefined, b: typeof a): boolean =>
  (a && toHex(a.serialize())) === (b && toHex(b.serialize()));

// An intent hash does not change with the binding. It is exported for a test: a shielded
// offer needs a real proof, so a test cannot reach this check through `pay`.
export function keepsProven(
  proven: Transaction<SignatureEnabled, Proof, PreBinding>,
  paid: Transaction<SignatureEnabled, Proof, Binding>,
): boolean {
  const mine = proven.intents ?? new Map<number, Intent<SignatureEnabled, Proof, PreBinding>>();
  for (const [segment, intent] of mine) {
    if (paid.intents?.get(segment)?.intentHash(segment) !== intent.intentHash(segment))
      return false;
  }
  // The policy lets the sponsor add one DUST-only intent, and nothing else.
  const added = [...(paid.intents ?? [])].filter(([segment]) => !mine.has(segment));
  const feeOnly = ([, intent]: (typeof added)[number]): boolean =>
    intent.actions.length === 0 &&
    !intent.guaranteedUnshieldedOffer &&
    !intent.fallibleUnshieldedOffer;
  if (added.length > 1 || !added.every(feeOnly)) return false;
  const fallible = [...(proven.fallibleOffer ?? [])];
  return (
    sameOffer(proven.guaranteedOffer, paid.guaranteedOffer) &&
    fallible.length === (paid.fallibleOffer?.size ?? 0) &&
    fallible.every(([segment, offer]) => sameOffer(offer, paid.fallibleOffer?.get(segment)))
  );
}
