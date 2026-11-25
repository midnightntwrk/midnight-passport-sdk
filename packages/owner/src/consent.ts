import {
  storeConsentRecord,
  type ConsentRecord,
  type ContractAddress,
  type LocalStore,
} from '@midnight-ntwrk/mn-passport-core';

const ADDRESS = /^[0-9a-f]{64}$/;

/** The prover consent of one account. A malformed `account` throws `TypeError`. */
export function accountConsentRecord(store: LocalStore, account: ContractAddress): ConsentRecord {
  if (!ADDRESS.test(account))
    throw new TypeError('The account address is not 64 lowercase hex digits.');
  return storeConsentRecord(store, `account/${account}/prover-consent`);
}
