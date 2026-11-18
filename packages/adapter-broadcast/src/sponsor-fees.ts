import {
  CancelledError,
  SponsorUnavailableError,
  UpstreamError,
  sponsorRefusal,
  type AbortSignalLike,
  type Fees,
  type HttpResponse,
  type PaidTransaction,
  type Platform,
  type SponsorAnswer,
} from '@midnight-ntwrk/mn-passport-core';
import { checkMs, checkUrl } from './host.js';
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

type Ledger = typeof import('@midnightntwrk/ledger-v9');

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
      const ledger = await loadLedger(platform, signal);
      requireProven(ledger, tx.bytes);
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
      const paid = readPaid(ledger, body);
      if (!paid) throw new SponsorUnavailableError('stop', answer.response.status);
      return { stage: 'paid', ...paid, submitBy: startedAt + paymentTtlMs };
    },
  };
}

// An abort ends the wait at once, and a load failure keeps no upstream text.
function loadLedger(platform: Platform, signal: AbortSignalLike | undefined): Promise<Ledger> {
  const fail = (sourceTag: string) => () => {
    throw new UpstreamError({ sourceTag });
  };
  const load = platform
    .loadRuntimes()
    .then(() => import('@midnightntwrk/ledger-v9').catch(fail('ledger-v9')), fail('loadRuntimes'));
  return new Promise<Ledger>((resolve, reject) => {
    const onAbort = (): void => reject(new CancelledError('caller'));
    signal?.addEventListener('abort', onAbort);
    load.then(resolve, reject).finally(() => signal?.removeEventListener('abort', onAbort));
  });
}

// An unproven transaction shows its private inputs to the sponsor.
function requireProven(ledger: Ledger, bytes: Uint8Array): void {
  try {
    ledger.Transaction.deserialize('signature', 'proof', 'pre-binding', bytes);
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

function readPaid(
  ledger: Ledger,
  body: unknown,
): Pick<PaidTransaction, 'bytes' | 'id'> | undefined {
  const hex = field(body, 'tx');
  const bytes = typeof hex === 'string' ? fromHex(hex) : undefined;
  if (!bytes) return undefined;
  let ids: readonly string[];
  try {
    ids = ledger.Transaction.deserialize('signature', 'proof', 'binding', bytes).identifiers();
  } catch {
    return undefined;
  }
  const id = ids.at(-1);
  return id !== undefined && ID.test(id) ? { bytes, id } : undefined;
}
