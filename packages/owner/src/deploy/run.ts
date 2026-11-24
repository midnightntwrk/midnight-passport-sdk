import {
  PassportError,
  TimeoutError,
  type CallInputs,
  type Indexer,
  type LocalStore,
  type Prover,
  type Sender,
  type TransactionStatus,
} from '@midnight-ntwrk/mn-passport-core';
import { saveRecord } from '../account.js';
import { AuthorityKeyMismatchError, type AuthorityKey } from '../kernel/index.js';
import { deployTransaction, updateTransaction } from './birth.js';
import type { Ledger } from './price.js';
import { writeRecord, type BirthRecord } from './record.js';

export type DeployProgress =
  | { readonly kind: 'planned'; readonly waves: number }
  | {
      readonly kind: 'wave';
      readonly n: number;
      readonly of: number;
      readonly status: TransactionStatus;
    }
  | { readonly kind: 'skipped'; readonly n: number; readonly of: number }
  | { readonly kind: 'activated'; readonly status: TransactionStatus }
  | { readonly kind: 'done' };

export interface RunOptions {
  readonly ledger: Ledger;
  readonly store: LocalStore;
  readonly sender: Sender;
  readonly prover: Prover;
  /** Give it a `nodeUrl`, so that a wave shows before finality. */
  readonly indexer: Indexer;
  readonly authority: AuthorityKey;
  /** `true` once the account's initial device is active. The compiled module reads it. */
  readonly booted: (stateBytes: Uint8Array) => boolean;
  /** Builds the unproven activation (see `activationCall`). */
  readonly activate: (
    record: BirthRecord,
    inputs: CallInputs,
    ttlSeconds: number,
  ) => Promise<Uint8Array>;
  readonly verifierKey: (circuit: string) => Promise<Uint8Array>;
  /** Bounds each wait on the chain. */
  readonly timeoutMs: number;
  /** The TTL of each transaction. It must cover a proof. Default: 5 minutes. */
  readonly ttlMs?: number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now?: () => number;
  readonly onProgress?: (progress: DeployProgress) => void;
}

/**
 * Sends what the chain lacks, in order: wave 1, activation, then each update.
 * A stop at any point resumes from the record and the chain. A wave in flight
 * is never paid again before its TTL passes.
 */
export async function runBirth(start: BirthRecord, options: RunOptions): Promise<BirthRecord> {
  const { ledger, indexer, sender, prover } = options;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? 300_000;
  const of = start.plan.updates.length + 1;
  // Before any send: a key from a changed PRF value would pay for waves it cannot finish.
  if (options.authority.verifyingKey.value !== start.authority.publicKey) {
    throw new AuthorityKeyMismatchError();
  }
  // A second birth on this device stops here, before anything is paid.
  await saveRecord(options.store, start);
  let record = start;
  const save = async (next: BirthRecord): Promise<void> => {
    record = next;
    await writeRecord(options.store, next);
  };
  options.onProgress?.({ kind: 'planned', waves: of });

  if (record.inFlight !== undefined) {
    const left = record.inFlight.notAfter - now();
    if (left > 0) {
      await sender.final(record.inFlight.id, { timeoutMs: left }).catch((e: unknown) => {
        // Past its TTL the old payment cannot land, so a new one is safe.
        if (!(e instanceof PassportError && e._tag === 'TimeoutError')) throw e;
      });
    }
    await save({ ...record, inFlight: undefined });
  }

  const send = async (
    build: () => Promise<Uint8Array>,
    circuits: readonly string[],
    until: 'in-block' | 'final',
  ): Promise<TransactionStatus> => {
    const written: Promise<void>[] = [];
    let status: TransactionStatus;
    try {
      status = await sender.send(
        async (callOptions) =>
          prover.prove({ stage: 'unproven', bytes: await build() }, circuits, callOptions),
        {
          account: record.address,
          until,
          timeoutMs: options.timeoutMs,
          // A rebuild submits again, so one send can start several writes.
          onSubmitted: (id) => {
            const write = save({ ...record, inFlight: { id, notAfter: now() + ttlMs } });
            // `finally` throws the failure. This handler stops it from being unhandled before then.
            write.catch(() => undefined);
            written.push(write);
          },
        },
      );
    } finally {
      await Promise.all(written);
    }
    await save({ ...record, inFlight: undefined });
    return status;
  };

  const readState = async (): Promise<Uint8Array | undefined> =>
    (await indexer.contractState(record.address))?.bytes;
  const waitFor = async <A>(read: () => Promise<A | undefined>): Promise<A> => {
    const deadline = now() + options.timeoutMs;
    for (;;) {
      const value = await read();
      if (value !== undefined) return value;
      if (now() > deadline) throw new TimeoutError(options.timeoutMs);
      await options.sleep(1_000);
    }
  };
  const counterOf = (bytes: Uint8Array): bigint =>
    ledger.ContractState.deserialize(bytes).maintenanceAuthority.counter;

  let state = await readState();
  if (state === undefined) {
    const status = await send(
      () => Promise.resolve(deployTransaction(ledger, record, ttlMs)),
      [],
      'in-block',
    );
    options.onProgress?.({ kind: 'wave', n: 1, of, status });
    state = await waitFor(readState);
  } else {
    options.onProgress?.({ kind: 'skipped', n: 1, of });
  }

  if (!options.booted(state)) {
    // A call is built from the indexer's inputs, which see a new contract only at finality.
    const status = await send(
      async () =>
        options.activate(
          record,
          await waitFor(() => indexer.callInputs(record.address)),
          Math.floor(ttlMs / 1000),
        ),
      ['activate_initial_device_with_p256'],
      'final',
    );
    // At `final`, the sender rejects a failed call with `CallFailedError`.
    await save({ ...record, salt: undefined });
    options.onProgress?.({ kind: 'activated', status });
  } else if (record.salt !== undefined) {
    await save({ ...record, salt: undefined });
  }

  const committee = ledger.ContractState.deserialize(state).maintenanceAuthority.committee;
  options.authority.requireCommittee(committee);
  // Another update can move the counter, so only the circuits on chain show that an update landed.
  const holds = (bytes: Uint8Array, circuits: readonly string[]): boolean => {
    const onChain = new Set(ledger.ContractState.deserialize(bytes).operations().map(String));
    return circuits.every((c) => onChain.has(c));
  };
  for (const [i, circuits] of record.plan.updates.entries()) {
    if (holds(state, circuits)) {
      options.onProgress?.({ kind: 'skipped', n: i + 2, of });
      continue;
    }
    const at = counterOf(state);
    const status = await send(
      () => updateTransaction(ledger, record, options.authority, i, at, options.verifierKey, ttlMs),
      [],
      'in-block',
    );
    options.onProgress?.({ kind: 'wave', n: i + 2, of, status });
    state = await waitFor(async () => {
      const bytes = await readState();
      return bytes !== undefined && holds(bytes, circuits) ? bytes : undefined;
    });
  }
  options.onProgress?.({ kind: 'done' });
  return record;
}
