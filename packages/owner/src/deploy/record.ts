import { PassportError, type LocalStore } from '@midnight-ntwrk/mn-passport-core';
import { ascii, fromAscii } from '../bytes.js';
import type { BirthPlan } from './plan.js';

/** Everything a resume needs. It holds public data and ciphertext only. */
export interface BirthRecord {
  readonly version: 1;
  readonly networkId: string;
  readonly address: string;
  /** Hex of an unproven transaction that holds the deploy. The deploy keeps its nonce, so the address holds. */
  readonly deploy: string;
  readonly plan: BirthPlan;
  /** The BIP-340 committee key and its PRF wrap. */
  readonly authority: { readonly publicKey: string; readonly wrap: string };
  readonly passkey: {
    readonly credentialId: string;
    /** Hex of `x ‖ y`. */
    readonly publicKey: string;
    readonly rpIdHash: string;
    readonly origin: string;
  };
  /** Hex. Dropped once activation lands. */
  readonly salt: string | undefined;
  readonly viewing: { readonly publicKey: string; readonly wrap: string };
  /** The last paid transaction, until it lands or its TTL passes. */
  readonly inFlight: { readonly id: string; readonly notAfter: number } | undefined;
}

export class DeployRecordInvalidError extends PassportError {
  readonly _tag = 'DeployRecordInvalidError';
  readonly code = 'DEPLOY_RECORD_INVALID';

  constructor() {
    super('The stored deploy record cannot be read.');
    this.name = 'DeployRecordInvalidError';
  }
}

const HEX = /^(?:[0-9a-f]{2})*$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const isHex = (value: unknown): value is string => typeof value === 'string' && HEX.test(value);
const isWrapped = (value: unknown): boolean =>
  isObject(value) && isHex(value.publicKey) && isHex(value.wrap);
const isNames = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((name) => typeof name === 'string');

function isRecord(value: unknown): value is BirthRecord {
  if (!isObject(value) || value.version !== 1) return false;
  const { plan, passkey, authority, viewing, inFlight } = value;
  return (
    typeof value.networkId === 'string' &&
    isHex(value.address) &&
    isHex(value.deploy) &&
    isWrapped(authority) &&
    (value.salt === undefined || isHex(value.salt)) &&
    isObject(plan) &&
    isNames(plan.waveOne) &&
    Array.isArray(plan.updates) &&
    plan.updates.every(isNames) &&
    isObject(passkey) &&
    isHex(passkey.credentialId) &&
    isHex(passkey.publicKey) &&
    isHex(passkey.rpIdHash) &&
    typeof passkey.origin === 'string' &&
    isWrapped(viewing) &&
    (inFlight === undefined ||
      (isObject(inFlight) &&
        typeof inFlight.id === 'string' &&
        typeof inFlight.notAfter === 'number'))
  );
}

const storeKey = (address: string): string => `deploy:${address}`;

/** Claims no account. `saveRecord` does. */
export async function writeRecord(store: LocalStore, record: BirthRecord): Promise<void> {
  await store.set(storeKey(record.address), ascii(JSON.stringify(record)));
}

/** `undefined` when no record exists for `address`. */
export async function loadRecord(
  store: LocalStore,
  address: string,
): Promise<BirthRecord | undefined> {
  const bytes = await store.get(storeKey(address));
  if (bytes === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(fromAscii(bytes));
  } catch {
    throw new DeployRecordInvalidError();
  }
  if (!isRecord(value) || value.address !== address) throw new DeployRecordInvalidError();
  return value;
}
