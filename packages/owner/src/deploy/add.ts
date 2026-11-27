import type { AccManifest } from '@midnight-ntwrk/mn-passport-contract';
import { PassportError } from '@midnight-ntwrk/mn-passport-core';
import { packWaves, type WavePrice } from './plan.js';
import type { Ledger } from './price.js';
import type { BirthRecord } from './record.js';

/** The circuits that let a dApp's JubJub grant key spend under its grant. */
export function grantSpendCircuits(manifest: AccManifest): readonly string[] {
  return manifest.circuits.jubjub.filter((circuit) =>
    /^withdraw_.*_with_grant_jubjub$/.test(circuit),
  );
}

/** No maintenance authority is left, so no circuit can be added. */
export class AuthorityRetiredError extends PassportError {
  readonly _tag = 'AuthorityRetiredError';
  readonly code = 'AUTHORITY_RETIRED';

  constructor() {
    super('The account has no maintenance authority left, so it cannot gain circuits.');
    this.name = 'AuthorityRetiredError';
  }
}

/** `true` while the account's maintenance authority has a key. */
export function canAddCircuits(ledger: Ledger, stateBytes: Uint8Array): boolean {
  return ledger.ContractState.deserialize(stateBytes).maintenanceAuthority.committee.length > 0;
}

export interface AdditionOptions {
  readonly ledger: Ledger;
  /** The account's current state. */
  readonly state: Uint8Array;
  readonly circuits: readonly string[];
  readonly price: WavePrice;
  readonly headroom?: number;
}

/**
 * Appends updates for the circuits that neither the chain nor the plan has. Save the record, then
 * `runBirth` sends each update whose circuits the chain lacks.
 */
export function planAddition(record: BirthRecord, options: AdditionOptions): BirthRecord {
  if (!canAddCircuits(options.ledger, options.state)) throw new AuthorityRetiredError();
  const onChain = new Set(
    options.ledger.ContractState.deserialize(options.state).operations().map(String),
  );
  const planned = new Set([...record.plan.waveOne, ...record.plan.updates.flat()]);
  const wanted = options.circuits.filter((c) => !onChain.has(c) && !planned.has(c));
  if (wanted.length === 0) return record;
  const updates = packWaves(wanted, options.price, options.headroom ?? 0.5);
  return { ...record, plan: { ...record.plan, updates: [...record.plan.updates, ...updates] } };
}
