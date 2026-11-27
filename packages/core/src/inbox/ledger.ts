import { AccountStateError } from '../acc-call.js';
import type { InboxLedger } from './walk.js';

/** The `ledger` function of the ACC module. Its generated types own the shape and never reach the SDK. */
export type AccountLedgerOf = (state: never) => unknown;

export interface AccountLedger extends InboxLedger {
  /** The X25519 key that a depositor seals an inbox entry to. */
  readonly enc_key: Uint8Array;
}

const isAccountLedger = (value: unknown): value is AccountLedger => {
  if (typeof value !== 'object' || value === null) return false;
  const { enc_key, inbox_count, inbox } = value as Record<string, unknown>;
  if (typeof inbox !== 'object' || inbox === null) return false;
  const { member, lookup } = inbox as Record<string, unknown>;
  return (
    enc_key instanceof Uint8Array &&
    enc_key.length === 32 &&
    typeof inbox_count === 'bigint' &&
    typeof member === 'function' &&
    typeof lookup === 'function'
  );
};

/** Bytes that are not the state of an account give `AccountStateError`. */
export async function readAccountLedger(
  bytes: Uint8Array,
  ledger: AccountLedgerOf,
): Promise<AccountLedger> {
  const { deserializeLedger9CompactContractState } =
    await import('@midnight-ntwrk/midnight-js/utils');
  try {
    const state = deserializeLedger9CompactContractState(bytes, { caller: 'readAccountLedger' });
    // The module's own types say that it takes this runtime state.
    const value = ledger(state.data as never);
    // The fields are lazy getters, so a foreign state throws only here.
    if (isAccountLedger(value)) return value;
  } catch {
    // The runtime's text says nothing that the caller can act on.
  }
  throw new AccountStateError();
}
