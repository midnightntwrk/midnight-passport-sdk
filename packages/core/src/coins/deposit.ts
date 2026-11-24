import { buildAccCall, type AccCallInput } from '../acc-call.js';
import { checkCoin, sealInboxEntry, type CoinDescription } from '../inbox/entry.js';
import { readAccountLedger, type AccountLedgerOf } from '../inbox/ledger.js';
import { PassportError } from '../passport-error.js';
import type { BlockRef, CallOptions, ContractAddress } from '../seams/common.js';
import type { Indexer } from '../seams/indexer.js';
import type { TransactionStatus, UnprovenTransaction } from '../seams/transaction.js';

declare const crypto: { getRandomValues(bytes: Uint8Array): Uint8Array };

export type Deposit =
  | { readonly kind: 'unshielded'; readonly color: Uint8Array; readonly amount: bigint }
  | { readonly kind: 'shielded'; readonly color: Uint8Array; readonly value: bigint };

export interface DepositInput extends Pick<
  AccCallInput,
  'artifact' | 'contract' | 'coinPublicKey' | 'encryptionPublicKey' | 'networkId' | 'ttlSeconds'
> {
  /** The `ledger` function of the module that `artifact` pins. */
  readonly ledger: AccountLedgerOf;
  readonly indexer: Pick<Indexer, 'callInputs'>;
  readonly address: ContractAddress;
  readonly deposit: Deposit;
  readonly options?: CallOptions;
}

export interface BuiltDeposit {
  readonly transaction: UnprovenTransaction;
  /** The coin that the inbox entry describes. `undefined` for an unshielded deposit. */
  readonly coin: CoinDescription | undefined;
  /** The block that the indexer read. */
  readonly block: BlockRef;
}

/** Nothing was sent. */
export class DepositTargetError extends PassportError {
  readonly _tag = 'DepositTargetError';
  readonly code = 'DEPOSIT_TARGET';

  constructor() {
    super(
      'The indexer shows no contract at the deposit address. A new account can take some seconds to show.',
    );
    this.name = 'DepositTargetError';
  }
}

export class DepositFailedError extends PassportError {
  readonly _tag = 'DepositFailedError';
  readonly code = 'DEPOSIT_FAILED';
  /** True when the payer paid the fee. The account gets nothing in either case. */
  readonly feePaid: boolean;

  constructor(feePaid: boolean) {
    super(
      feePaid
        ? 'The deposit failed on chain, and the fee was paid.'
        : 'The deposit failed on chain.',
    );
    this.name = 'DepositFailedError';
    this.feePaid = feePaid;
  }
}

const witnesses = {
  held_coin: () => {
    throw new Error('A deposit reads no held coin.');
  },
};

/**
 * Reads the state, the ledger parameters, and the account's encryption key at one block, so call
 * it again for each retry. A missing or changed deposit circuit gives `CircuitNotDeployedError` or
 * `VerifierKeyMismatchError`, and a state that is not an account's gives `AccountStateError`. An
 * `enc_key` with no agreement gives `InboxRecipientKeyError`. `options` covers only the read.
 */
export async function buildDeposit(input: DepositInput): Promise<BuiltDeposit> {
  const { deposit } = input;
  const amount = deposit.kind === 'shielded' ? deposit.value : deposit.amount;
  checkCoin({ nonce: new Uint8Array(32), color: deposit.color, value: amount });
  if (amount === 0n) throw new RangeError('A deposit must be worth at least 1.');
  const read = await input.indexer.callInputs(input.address, input.options);
  if (read === undefined) throw new DepositTargetError();
  let coin: CoinDescription | undefined;
  let args: readonly unknown[] = [deposit.color, amount];
  if (deposit.kind === 'shielded') {
    // A new nonce for each build, so that a retry never repeats a coin.
    coin = {
      nonce: crypto.getRandomValues(new Uint8Array(32)),
      color: deposit.color,
      value: amount,
    };
    const { enc_key } = await readAccountLedger(read.state.bytes, input.ledger);
    args = [coin, await sealInboxEntry(enc_key, coin)];
  }
  const bytes = await buildAccCall({
    artifact: input.artifact,
    contract: input.contract,
    coinPublicKey: input.coinPublicKey,
    encryptionPublicKey: input.encryptionPublicKey,
    networkId: input.networkId,
    ttlSeconds: input.ttlSeconds,
    witnesses,
    state: read.state,
    ledgerParameters: read.ledgerParameters,
    zswapChainState: read.zswapChainState,
    circuit: deposit.kind === 'shielded' ? 'deposit_shielded' : 'deposit_unshielded',
    args,
  });
  return { transaction: { stage: 'unproven', bytes }, coin, block: read.block };
}

/** Takes a `final` status of the deposit, and throws `DepositFailedError` unless it succeeded. */
export function requireDeposited(status: TransactionStatus): void {
  if (status.level !== 'final' || status.result === undefined) {
    throw new RangeError('The deposit is not final yet.');
  }
  if (status.result !== 'succeeded')
    throw new DepositFailedError(status.result === 'partly-failed');
}
