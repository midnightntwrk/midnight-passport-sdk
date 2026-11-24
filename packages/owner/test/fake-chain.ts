import * as ledger from '@midnightntwrk/ledger-v9';
import {
  createSender,
  nodeRefusal,
  type Broadcast,
  type CallInputs,
  type Fees,
  type Indexer,
  type LocalStore,
  type Prover,
  type Sender,
  type TransactionResult,
} from '@midnight-ntwrk/mn-passport-core';
import type { BirthRecord } from '@midnight-ntwrk/mn-passport-owner';
import { VERIFIER_KEY_HEX } from './fixtures/verifier-key.js';

export const verifierKey = async (): Promise<Uint8Array> => Buffer.from(VERIFIER_KEY_HEX, 'hex');

/** The activation builder of a test returns these bytes, so the fake chain can tell it apart. */
export const ACTIVATION = Uint8Array.of(0xac);

export type Kind = 'deploy' | 'activation' | `update@${string}`;

const block = { height: 1, hash: '00'.repeat(32) };

export function memoryStore(): LocalStore {
  const entries = new Map<string, Uint8Array>();
  return {
    get: async (key) => entries.get(key),
    set: async (key, value) => void entries.set(key, value),
    delete: async (key) => void entries.delete(key),
    keys: async () => [...entries.keys()],
    wipe: async () => entries.clear(),
  };
}

/**
 * One node, sponsor, and indexer for the owner tests. It applies deploys and updates as the ledger
 * would. Its `sender` is the real send loop of core.
 */
export class FakeChain {
  state: ledger.ContractState | undefined;
  booted = false;
  /** The kinds that landed, in order. */
  readonly sent: Kind[] = [];
  /** Every submit, also a refused one. */
  readonly submits: { readonly id: string; readonly kind: Kind; readonly bytes: Uint8Array }[] = [];
  activationResult: TransactionResult = 'succeeded';
  /** The submit of this kind lands, then throws, as a page that closes would. */
  stopAfter: Kind | undefined;
  /** The node refuses the first submit of this kind, as it refuses an intent past its TTL. */
  refuseOnce: Kind | undefined;
  /** What the indexer shows for a paid transaction from an earlier run. */
  earlier: 'lands' | 'lost' = 'lost';
  pendingDeploy: ledger.ContractDeploy | undefined;
  finals = 0;
  readonly #landed = new Map<string, TransactionResult>();
  #paid = 0;

  readonly indexer: Indexer = {
    contractState: async (address) =>
      this.state && { address, bytes: this.state.serialize(), block },
    callInputs: async (address): Promise<CallInputs | undefined> =>
      this.state && {
        state: { address, bytes: this.state.serialize(), block },
        ledgerParameters: new Uint8Array(),
        zswapChainState: new Uint8Array(),
        block,
      },
    ledgerParameters: () => Promise.reject(new Error('not used')),
    zswapEvents: () => Promise.reject(new Error('not used')),
    transaction: () => Promise.reject(new Error('not used')),
    watchContract: () => {
      throw new Error('not used');
    },
    watchTransaction: (id) => ({
      current: () => undefined,
      subscribe: (listener) => {
        this.finals++;
        if (this.earlier === 'lands') {
          if (this.pendingDeploy && !this.state) this.state = this.pendingDeploy.initialState;
          listener({ found: true, value: { id, level: 'final', block, result: 'succeeded' } });
        }
        return () => undefined;
      },
    }),
  };

  readonly prover: Prover = {
    prove: async (tx) => ({ stage: 'proven', bytes: tx.bytes }),
  };

  readonly fees: Fees = {
    pay: async (tx) => ({
      stage: 'paid',
      bytes: tx.bytes,
      id: `tx${String(++this.#paid)}`,
      submitBy: undefined,
    }),
  };

  readonly broadcast: Broadcast = {
    submit: async (tx, options) => {
      if (!this.#landed.has(tx.id)) {
        const kind = this.kindOf(tx.bytes);
        this.submits.push({ id: tx.id, kind, bytes: tx.bytes });
        if (this.refuseOnce === kind) {
          this.refuseOnce = undefined;
          throw nodeRefusal(['Custom error: 228']) ?? new Error('not a refusal');
        }
        this.apply(tx.bytes);
        this.sent.push(kind);
        this.#landed.set(tx.id, this.resultOf(kind));
        if (this.stopAfter === kind) throw new Error('the page closed');
      }
      const result = options.until === 'final' ? this.#landed.get(tx.id) : undefined;
      return { id: tx.id, level: options.until, block, result };
    },
  };

  // A lost payment is given up at once, so that no test waits for a timer.
  readonly sender: Sender = createSender(this, { lostWaitMs: 0, contentionPauseMs: 0 });

  /** Lands a transaction that no run sent, as another tool would. */
  landOutside(bytes: Uint8Array): void {
    this.apply(bytes);
  }

  private resultOf(kind: Kind): TransactionResult {
    return kind === 'activation' ? this.activationResult : 'succeeded';
  }

  private actionOf(bytes: Uint8Array) {
    const tx = ledger.Transaction.deserialize('signature', 'pre-proof', 'pre-binding', bytes);
    return [...(tx.intents?.values() ?? [])].flatMap((intent) => intent.actions)[0];
  }

  private kindOf(bytes: Uint8Array): Kind {
    if (bytes.length === 1 && bytes[0] === ACTIVATION[0]) return 'activation';
    const action = this.actionOf(bytes);
    if (action instanceof ledger.ContractDeploy) return 'deploy';
    if (action instanceof ledger.MaintenanceUpdate) return `update@${String(action.counter)}`;
    throw new Error('unknown');
  }

  private apply(bytes: Uint8Array): void {
    if (bytes.length === 1 && bytes[0] === ACTIVATION[0]) {
      if (this.activationResult === 'succeeded') this.booted = true;
      return;
    }
    const action = this.actionOf(bytes);
    if (action instanceof ledger.ContractDeploy) {
      this.state = action.initialState;
      return;
    }
    if (!(action instanceof ledger.MaintenanceUpdate) || !this.state) throw new Error('unknown');
    const authority = this.state.maintenanceAuthority;
    const [signed] = action.signatures;
    const [member] = authority.committee;
    if (
      action.counter !== authority.counter ||
      !signed ||
      !member ||
      !ledger.verifySignature(member, action.dataToSign, signed[1])
    ) {
      throw new Error('the node refuses the update');
    }
    const next = new ledger.ContractState();
    next.data = this.state.data;
    for (const name of this.state.operations()) {
      const op = this.state.operation(name);
      if (op) next.setOperation(name, op);
    }
    for (const insert of action.updates) {
      if (!(insert instanceof ledger.VerifierKeyInsert)) throw new Error('unknown');
      const op = new ledger.ContractOperation();
      op.verifierKey = Buffer.from(VERIFIER_KEY_HEX, 'hex');
      next.setOperation(insert.operation, op);
    }
    next.maintenanceAuthority = new ledger.ContractMaintenanceAuthority(
      authority.committee,
      authority.threshold,
      authority.counter + 1n,
    );
    this.state = next;
  }
}

/** A record for a deploy with no constructor data: the run never reads the data. */
export function testRecord(committee: ledger.SignatureVerifyingKey, wrap = '00'): BirthRecord {
  const state = new ledger.ContractState();
  state.maintenanceAuthority = new ledger.ContractMaintenanceAuthority([committee], 1, 0n);
  const op = new ledger.ContractOperation();
  op.verifierKey = Buffer.from(VERIFIER_KEY_HEX, 'hex');
  state.setOperation('activate_initial_device_with_p256', op);
  const deploy = new ledger.ContractDeploy(state);
  const tx = ledger.Transaction.fromParts(
    'undeployed',
    undefined,
    undefined,
    ledger.Intent.new(new Date(Date.now() + 60_000)).addDeploy(deploy),
  );
  return {
    version: 1,
    networkId: 'undeployed',
    address: deploy.address,
    deploy: Buffer.from(tx.serialize()).toString('hex'),
    plan: {
      waveOne: ['activate_initial_device_with_p256'],
      updates: [['add_device_with_p256'], ['remove_device_with_p256', 'issue_grant_with_p256']],
    },
    authority: { publicKey: committee.value, wrap },
    passkey: {
      credentialId: '07',
      publicKey: '00'.repeat(64),
      rpIdHash: '00'.repeat(32),
      origin: '',
    },
    salt: '11'.repeat(32),
    viewing: { publicKey: '00'.repeat(32), wrap: '00' },
    inFlight: undefined,
  };
}
