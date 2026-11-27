import {
  identifyBinding,
  readDeployedCircuits,
  type ArtifactRead,
  type BindingRow,
  type Identified,
} from '@midnight-ntwrk/mn-passport-contract';
import { PassportError, type Indexer, type LocalStore } from '@midnight-ntwrk/mn-passport-core';
import { ascii, fromAscii, fromHex } from './bytes.js';
import { contractPoint, contractPolicy } from './deploy/birth.js';
import { loadRecord, writeRecord, type BirthRecord } from './deploy/record.js';

const POINTER = 'passport:account:v1';

/** The fields of the ACC ledger that a lookup reads. The compiled module decodes them. */
export interface AccountLedger {
  readonly booted: boolean;
  readonly device_epoch: bigint;
  readonly auth_nonce: bigint;
  readonly devices: { member(entry: Uint8Array): boolean };
}

/** The parts of the compiled ACC module that a lookup runs. */
export interface AccLookupModule {
  ledger(stateBytes: Uint8Array): AccountLedger;
  readonly pureCircuits: {
    derive_device_entry_with_p256(
      self: { readonly bytes: Uint8Array },
      pk: ReturnType<typeof contractPoint>,
      policy: ReturnType<typeof contractPolicy>,
      epoch: bigint,
      counter: bigint,
    ): Uint8Array;
  };
}

export type AccountLookup =
  | { readonly state: 'none' }
  | { readonly state: 'deploying'; readonly record: BirthRecord }
  | {
      readonly state: 'ready';
      readonly record: BirthRecord;
      /** With status `unsupported`, build no call for this account. */
      readonly binding: Identified;
      /** The use counter of this passkey's device entry, for its next signature. */
      readonly useCounter: bigint;
    };

/** A deploy would make a second account on this device. */
export class AccountExistsError extends PassportError {
  readonly _tag = 'AccountExistsError';
  readonly code = 'ACCOUNT_EXISTS';
  readonly address: string;

  constructor(address: string) {
    super(`This device already has the account ${address}.`);
    this.name = 'AccountExistsError';
    this.address = address;
  }
}

/** The account on chain holds this passkey as no device. */
export class AccountMismatchError extends PassportError {
  readonly _tag = 'AccountMismatchError';
  readonly code = 'ACCOUNT_MISMATCH';

  constructor() {
    super('The account on chain does not hold this passkey as a device.');
    this.name = 'AccountMismatchError';
  }
}

async function pointer(store: LocalStore): Promise<string | undefined> {
  const bytes = await store.get(POINTER);
  return bytes === undefined ? undefined : fromAscii(bytes);
}

// A pointer with no record is a birth stopped before its record was saved: it holds no account.
async function claimed(store: LocalStore): Promise<string | undefined> {
  const address = await pointer(store);
  if (address === undefined || (await loadRecord(store, address)) === undefined) return undefined;
  return address;
}

/** Run it before the passkey is made, so that a second birth costs no prompt. */
export async function assertNoAccount(store: LocalStore): Promise<void> {
  const address = await claimed(store);
  if (address !== undefined) throw new AccountExistsError(address);
}

/**
 * Saves the record and claims its account for this device, so a reload keeps the birth. A record
 * of another claimed account rejects. A stored record of the same account is replaced.
 */
export async function saveRecord(store: LocalStore, record: BirthRecord): Promise<void> {
  const address = await claimed(store);
  if (address !== undefined && address !== record.address) throw new AccountExistsError(address);
  // A pointer counts only when its record loads, so the record goes first.
  await writeRecord(store, record);
  await store.set(POINTER, ascii(record.address));
}

export interface LookupOptions {
  readonly store: LocalStore;
  /** An unreachable source rejects. It never reads as "no account". */
  readonly indexer: Indexer;
  readonly module: AccLookupModule;
  /** Reads the manifest of a build in the binding registry. */
  readonly readFor: (row: BindingRow) => ArtifactRead;
}

/**
 * This device's account: the local record, confirmed on chain. Sends nothing. An account that
 * matches no build, or more than one, rejects with the registry's error.
 */
export function lookupAccount(options: LookupOptions): Promise<AccountLookup> {
  return lookupWith(options, (onChain) => identifyBinding(onChain, options.readFor));
}

/** Not exported from the package. A test gives its own build table through `identify`. */
export async function lookupWith(
  options: Omit<LookupOptions, 'readFor'>,
  identify: (onChain: ReadonlyMap<string, string>) => Promise<Identified>,
): Promise<AccountLookup> {
  const address = await pointer(options.store);
  if (address === undefined) return { state: 'none' };
  const record = await loadRecord(options.store, address);
  if (record === undefined) return { state: 'none' };
  const state = await options.indexer.contractState(address);
  if (state === undefined) return { state: 'deploying', record };

  const binding = await identify(await readDeployedCircuits(state.bytes));
  const { arms } = binding;
  if (arms.p256 === 'absent') throw new AccountMismatchError();
  const ledger = options.module.ledger(state.bytes);
  const birthDone = arms.shared === 'complete' && arms.p256 === 'complete';
  if (!ledger.booted || !birthDone) return { state: 'deploying', record };

  const pk = contractPoint(fromHex(record.passkey.publicKey));
  const policy = contractPolicy({
    rpIdHash: fromHex(record.passkey.rpIdHash),
    origin: record.passkey.origin,
  });
  // Each signature moves the entry's counter and `auth_nonce` together, so the live counter is at
  // most `auth_nonce`. With one device they are equal, so the search starts there.
  for (let counter = ledger.auth_nonce; counter >= 0n; counter--) {
    const entry = options.module.pureCircuits.derive_device_entry_with_p256(
      { bytes: fromHex(address) },
      pk,
      policy,
      ledger.device_epoch,
      counter,
    );
    if (ledger.devices.member(entry))
      return { state: 'ready', record, binding, useCounter: counter };
  }
  throw new AccountMismatchError();
}
