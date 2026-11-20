export interface RecordedAnswer {
  readonly name: string;
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface Expected {
  readonly tag: string;
  readonly action: 'retry' | 'stop';
  readonly status: number | undefined;
  readonly retryAfterMs?: number;
}

const error = (error: string, message: string, extra: Record<string, string> = {}): string =>
  JSON.stringify({ error, message, ...extra });

// Only the rows that run adapter code: the body `reason`, `Retry-After` in each
// header case, and a body that is not JSON. Core's tests own the status table.
// The bodies use the error shape of the Capacity Exchange server 2.0.0 sponsor
// route, `{ error, message, details? }`.
export const REFUSALS: readonly (readonly [RecordedAnswer, Expected])[] = [
  [
    {
      name: '503 wallet-syncing with Retry-After in seconds',
      status: 503,
      headers: { 'Retry-After': '15' },
      body: error('Service Unavailable', 'wallet-syncing'),
    },
    { tag: 'SponsorBusyError', action: 'retry', status: 503, retryAfterMs: 15_000 },
  ],
  [
    // A proposed form: today's sponsor sends no `reason`.
    {
      name: '422 over-fee-cap',
      status: 422,
      body: error('Unprocessable Entity', 'over the cap', { reason: 'over-fee-cap' }),
    },
    { tag: 'SponsorOverCapError', action: 'stop', status: 422 },
  ],
  [
    // A proposed form: today's sponsor has no caller limit.
    {
      name: '429 with retry-after in lower case',
      status: 429,
      headers: { 'retry-after': '60' },
      body: error('Too Many Requests', 'caller limit'),
    },
    { tag: 'SponsorCallerLimitError', action: 'stop', status: 429, retryAfterMs: 60_000 },
  ],
  [
    { name: '502 HTML from a proxy', status: 502, body: '<html>Bad Gateway</html>' },
    { tag: 'SponsorUnavailableError', action: 'retry', status: 502 },
  ],
];
