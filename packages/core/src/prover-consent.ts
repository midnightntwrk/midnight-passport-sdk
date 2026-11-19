import { PassportError } from './passport-error.js';
import type { AbortSignalLike } from './seams/common.js';
import { CancelledError } from './seams/errors.js';
import type { Prover } from './seams/prover.js';

export interface ProverDisclosure {
  /** A new version for any change to `short` or `long`. */
  readonly version: string;
  /** Who runs the prover, as the user sees the name. */
  readonly operator: string;
  readonly short: string;
  readonly long: string;
}

export interface AcceptedDisclosure {
  readonly version: string;
  readonly operator: string;
}

export interface ConsentRecord {
  /** `undefined` when no valid entry is stored. */
  read(): Promise<AcceptedDisclosure | undefined>;
  write(accepted: AcceptedDisclosure): Promise<void>;
}

export type ConsentAnswer = 'accepted' | 'declined';

export interface ProverConsentOptions {
  readonly prover: Prover;
  readonly disclosure: ProverDisclosure;
  /** Only `'accepted'` is consent. Calls that wait together share one call. */
  readonly ask: (disclosure: ProverDisclosure) => Promise<ConsentAnswer>;
  readonly record: ConsentRecord;
}

export class ProverConsentDeclinedError extends PassportError {
  readonly _tag = 'ProverConsentDeclinedError';
  readonly code = 'PROVER_CONSENT_DECLINED';
  readonly version: string;

  constructor(version: string) {
    super(`The user did not accept the prover disclosure (version ${version}).`);
    this.name = 'ProverConsentDeclinedError';
    this.version = version;
  }
}

/** Keeps no cause, so that no store text reaches a log. */
export class ProverConsentRecordError extends PassportError {
  readonly _tag = 'ProverConsentRecordError';
  readonly code = 'PROVER_CONSENT_RECORD_FAILED';
  readonly step: 'read' | 'write';

  constructor(step: 'read' | 'write') {
    super(`The consent record could not be ${step === 'read' ? 'read' : 'written'}.`);
    this.name = 'ProverConsentRecordError';
    this.step = step;
  }
}

function untilAbort(work: Promise<void>, signal: AbortSignalLike | undefined): Promise<void> {
  if (!signal) return work;
  return new Promise<void>((resolve, reject) => {
    const onAbort = (): void => reject(new CancelledError('caller'));
    signal.addEventListener('abort', onAbort);
    void work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** One for each account. The inner prover gets no call before consent. */
export function withProverConsent(options: ProverConsentOptions): Prover {
  const { prover, disclosure, ask, record } = options;
  let pending: Promise<void> | undefined;

  const consent = async (): Promise<void> => {
    let stored: AcceptedDisclosure | undefined;
    try {
      stored = await record.read();
    } catch {
      throw new ProverConsentRecordError('read');
    }
    if (stored?.version === disclosure.version && stored.operator === disclosure.operator) return;
    if ((await ask(disclosure)) !== 'accepted') {
      throw new ProverConsentDeclinedError(disclosure.version);
    }
    try {
      await record.write({ version: disclosure.version, operator: disclosure.operator });
    } catch {
      throw new ProverConsentRecordError('write');
    }
  };

  const shared = (): Promise<void> => {
    pending ??= consent().finally(() => {
      pending = undefined;
    });
    return pending;
  };

  return {
    async prove(tx, circuitIds, proveOptions) {
      if (proveOptions?.signal?.aborted) throw new CancelledError('caller');
      await untilAbort(shared(), proveOptions?.signal);
      return prover.prove(tx, circuitIds, proveOptions);
    },
  };
}
