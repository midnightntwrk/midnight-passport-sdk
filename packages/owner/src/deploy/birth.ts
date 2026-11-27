import type {
  ConstructorContext,
  JubjubPoint,
  Secp256r1Point,
} from '@midnight-ntwrk/compact-runtime';
import type { WebAuthnPolicy } from '@midnight-ntwrk/mn-passport-core';
import { VETO_WINDOW_SECONDS } from '@midnight-ntwrk/mn-passport-protocol';
import { ascii, fromHex, toHex } from '../bytes.js';
import { PassportError } from '@midnight-ntwrk/mn-passport-core';
import {
  AuthorityKey,
  AuthorityKeyMismatchError,
  createViewingKey,
  openViewingKey,
  prfInputs,
  takePrf,
  type Kernel,
  type PrfInputs,
  type PrfResult,
  type SecretHandle,
} from '../kernel/index.js';
import type { BirthPlan } from './plan.js';
import { VERIFIER_KEY_VERSION, type Ledger } from './price.js';
import type { BirthRecord } from './record.js';

/** The caller's passkey. Its PRF reads live in the platform adapter. */
export interface BirthPasskey {
  readonly credentialId: Uint8Array;
  /** `x ‖ y`, 64 bytes, big-endian. */
  readonly publicKey: Uint8Array;
  readonly policy: WebAuthnPolicy;
  /** The PRF results of the create, when the platform gave them. */
  readonly created?: PrfResult | undefined;
  /** One prompt. A birth asks for both inputs only when the create gave no PRF result. */
  readPrf(inputs: Partial<PrfInputs>): Promise<PrfResult>;
}

/** A session's passkey: the record names its key and policy. */
export type SessionPasskey = Pick<BirthPasskey, 'readPrf'>;

export class ViewingWrapError extends PassportError {
  readonly _tag = 'ViewingWrapError';
  readonly code = 'VIEWING_WRAP_MISMATCH';

  constructor() {
    super("This passkey's PRF does not open the account's viewing wrap.");
    this.name = 'ViewingWrapError';
  }
}

/** One PRF prompt, for a resume or an addition in a later session. */
export async function openAuthority(
  ledger: Ledger,
  passkey: SessionPasskey,
  record: BirthRecord,
): Promise<AuthorityKey> {
  const { first } = await prfInputs();
  const key = await AuthorityKey.open(ledger, takePrf(await passkey.readPrf({ first }), 'first'), {
    publicKey: fromHex(record.authority.publicKey),
    wrap: fromHex(record.authority.wrap),
  });
  if (key === undefined) throw new AuthorityKeyMismatchError();
  return key;
}

/** One PRF prompt. The kernel holds the viewing secret from then on. */
export async function openViewing(
  kernel: Kernel,
  passkey: SessionPasskey,
  record: BirthRecord,
): Promise<SecretHandle> {
  const { second } = await prfInputs();
  const secret = await openViewingKey(takePrf(await passkey.readPrf({ second }), 'second'), {
    publicKey: fromHex(record.viewing.publicKey),
    wrap: fromHex(record.viewing.wrap),
  });
  if (secret === undefined) throw new ViewingWrapError();
  return kernel.holdSecret(secret);
}

interface ContractPolicy {
  readonly rp_id_hash: Uint8Array;
  readonly origin: Uint8Array;
}

/** The parts of the compiled ACC module that a birth runs. The app bundles the module. */
export interface AccBirthModule {
  readonly contract: {
    initialState(
      context: ConstructorContext<object>,
      boot: Uint8Array,
      encryptionKey: Uint8Array,
      recoveryPk: JubjubPoint,
      recoveryWrap: Uint8Array,
      vetoWindowSeconds: bigint,
    ): Promise<{ readonly currentContractState: { serialize(): Uint8Array } }>;
  };
  readonly pureCircuits: {
    derive_boot_commitment_with_p256(
      salt: Uint8Array,
      pk: Secp256r1Point,
      policy: ContractPolicy,
    ): Uint8Array;
  };
}

export interface BirthOptions {
  readonly ledger: Ledger;
  readonly kernel: Kernel;
  readonly module: AccBirthModule;
  readonly passkey: BirthPasskey;
  readonly plan: BirthPlan;
  readonly verifierKey: (circuit: string) => Promise<Uint8Array>;
  readonly networkId: string;
  readonly randomBytes: (length: number) => Uint8Array;
}

export interface Birth {
  readonly record: BirthRecord;
  /** Signs the updates of this birth. The caller disposes it after the last one lands. */
  readonly authority: AuthorityKey;
  /** The kernel's copy of the viewing secret. */
  readonly viewing: SecretHandle;
}

const big = (bytes: Uint8Array): bigint => BigInt(`0x${toHex(bytes)}`);

export function contractPoint(publicKey: Uint8Array): Secp256r1Point {
  if (publicKey.length !== 64) throw new RangeError('A p256 public key is 64 bytes.');
  return { x: big(publicKey.subarray(0, 32)), y: big(publicKey.subarray(32)), identity: false };
}

export function contractPolicy(policy: WebAuthnPolicy): ContractPolicy {
  return { rp_id_hash: policy.rpIdHash, origin: ascii(policy.origin) };
}

/**
 * Makes the keys, runs the constructor, and builds the deploy. Nothing is sent.
 * Save the record before the first send.
 */
export async function prepareBirth(options: BirthOptions): Promise<Birth> {
  const { ledger, kernel, module, passkey, plan } = options;
  const created = passkey.created;
  const prf =
    created?.first !== undefined && created.second !== undefined
      ? created
      : await passkey.readPrf(await prfInputs());
  const { key: authority, wrapped } = await AuthorityKey.create(ledger, takePrf(prf, 'first'));
  let handle: SecretHandle | undefined;
  const viewing = await createViewingKey(takePrf(prf, 'second'), (secret) => {
    handle = kernel.holdSecret(secret);
  });
  if (handle === undefined) throw new Error('The viewing secret was not held.');

  const salt = options.randomBytes(32);
  const pk = contractPoint(passkey.publicKey);
  const policy = contractPolicy(passkey.policy);
  // TODO: use the temporary JubJub bootstrap when the contract has it.
  const boot = module.pureCircuits.derive_boot_commitment_with_p256(salt, pk, policy);
  const runtime = await import('@midnight-ntwrk/compact-runtime');
  const constructed = await module.contract.initialState(
    runtime.createConstructorContext({}, toHex(options.randomBytes(32))),
    boot,
    viewing.publicKey,
    // The identity point: the recover gate refuses it, so there is no birth recovery.
    { x: 0n, y: 1n },
    new Uint8Array(64),
    VETO_WINDOW_SECONDS,
  );

  // Only the data: the constructor's state lists every circuit, with no keys.
  const state = new ledger.ContractState();
  state.data = ledger.ContractState.deserialize(constructed.currentContractState.serialize()).data;
  state.maintenanceAuthority = new ledger.ContractMaintenanceAuthority(
    [authority.verifyingKey],
    1,
    0n,
  );
  for (const circuit of plan.waveOne) {
    const op = new ledger.ContractOperation();
    op.verifierKey = await options.verifierKey(circuit);
    state.setOperation(circuit, op);
  }
  const deploy = new ledger.ContractDeploy(state);
  const tx = ledger.Transaction.fromParts(
    options.networkId,
    undefined,
    undefined,
    ledger.Intent.new(new Date(Date.now() + 60_000)).addDeploy(deploy),
  );
  return {
    authority,
    viewing: handle,
    record: {
      version: 1,
      networkId: options.networkId,
      address: deploy.address,
      deploy: toHex(tx.serialize()),
      plan,
      authority: { publicKey: toHex(wrapped.publicKey), wrap: toHex(wrapped.wrap) },
      passkey: {
        credentialId: toHex(passkey.credentialId),
        publicKey: toHex(passkey.publicKey),
        rpIdHash: toHex(passkey.policy.rpIdHash),
        origin: passkey.policy.origin,
      },
      salt: toHex(salt),
      viewing: { publicKey: toHex(viewing.publicKey), wrap: toHex(viewing.wrap) },
      inFlight: undefined,
    },
  };
}

/** The record's deploy in a new intent. The nonce and so the address stay. */
export function deployTransaction(ledger: Ledger, record: BirthRecord, ttlMs: number): Uint8Array {
  const old = ledger.Transaction.deserialize(
    'signature',
    'pre-proof',
    'pre-binding',
    fromHex(record.deploy),
  );
  const deploy = [...(old.intents?.values() ?? [])]
    .flatMap((intent) => intent.actions)
    .find((action) => action instanceof ledger.ContractDeploy);
  if (!(deploy instanceof ledger.ContractDeploy) || deploy.address !== record.address) {
    throw new RangeError('The record holds no deploy for its address.');
  }
  return ledger.Transaction.fromParts(
    record.networkId,
    undefined,
    undefined,
    ledger.Intent.new(new Date(Date.now() + ttlMs)).addDeploy(deploy),
  ).serialize();
}

/** Signs update `index` of the plan at `counter`, the chain's current authority counter. */
export async function updateTransaction(
  ledger: Ledger,
  record: BirthRecord,
  authority: AuthorityKey,
  index: number,
  counter: bigint,
  verifierKey: (circuit: string) => Promise<Uint8Array>,
  ttlMs: number,
): Promise<Uint8Array> {
  const circuits = record.plan.updates[index];
  if (circuits === undefined) throw new RangeError(`The plan has no update ${String(index)}.`);
  const inserts = [];
  for (const circuit of circuits) {
    inserts.push(
      new ledger.VerifierKeyInsert(
        circuit,
        new ledger.ContractOperationVersionedVerifierKey(
          VERIFIER_KEY_VERSION,
          await verifierKey(circuit),
        ),
      ),
    );
  }
  const update = new ledger.MaintenanceUpdate(record.address, inserts, counter);
  const signed = update.addSignature(0n, authority.sign(update.dataToSign));
  return ledger.Transaction.fromParts(
    record.networkId,
    undefined,
    undefined,
    ledger.Intent.new(new Date(Date.now() + ttlMs)).addMaintenanceUpdate(signed),
  ).serialize();
}
