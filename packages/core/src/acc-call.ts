import { Effect } from 'effect';
import * as acc from '@midnight-ntwrk/mn-passport-contract';
import { unprovenAccCall } from './midnight-js.js';
import { PassportError } from './passport-error.js';
import type { ContractState } from './seams/index.js';

export interface AccCallInput {
  readonly artifact: acc.AccArtifact;
  /** The `Contract` class of the ACC module that `artifact` pins. */
  readonly contract: new (witnesses: never) => object;
  /** Each one has the midnight-js witness signature. The module's generated types own it. */
  readonly witnesses: Readonly<Record<string, (...args: never) => unknown>>;
  readonly state: ContractState;
  /** From the chain. `LedgerParameters.initialParameters()` matches no live chain. */
  readonly ledgerParameters: Uint8Array;
  readonly zswapChainState: Uint8Array;
  readonly circuit: string;
  /** The module's generated types own their shape, and they never reach the SDK. */
  readonly args: readonly unknown[];
  /** Hex. */
  readonly coinPublicKey: string;
  /** Hex. */
  readonly encryptionPublicKey: string;
  readonly networkId: string;
  readonly ttlSeconds: number;
}

/**
 * No proof has happened. From `buildAccCall`, a signature in the call arguments already has, so
 * run `checkAccCircuits` before the prompt. `arm` is `undefined` when the build has no such circuit.
 */
export class CircuitNotDeployedError extends PassportError {
  readonly _tag = 'CircuitNotDeployedError';
  readonly code = 'CIRCUIT_NOT_DEPLOYED';
  readonly circuit: string;
  readonly arm: acc.AccGroup | undefined;

  constructor(circuit: string, arm: acc.AccGroup | undefined) {
    super(`The account has no circuit "${circuit}"${arm ? ` (arm ${arm})` : ''}.`);
    this.name = 'CircuitNotDeployedError';
    this.circuit = circuit;
    this.arm = arm;
  }
}

export class VerifierKeyMismatchError extends PassportError {
  readonly _tag = 'VerifierKeyMismatchError';
  readonly code = 'VERIFIER_KEY_MISMATCH';
  readonly circuit: string;

  constructor(circuit: string) {
    super(`The on-chain verifier key of "${circuit}" is not the pinned one.`);
    this.name = 'VerifierKeyMismatchError';
    this.circuit = circuit;
  }
}

/** The bytes are not a serialized ledger contract state. */
export class AccountStateError extends PassportError {
  readonly _tag = 'AccountStateError';
  readonly code = 'ACCOUNT_STATE';

  constructor() {
    super('The account state bytes cannot be read.');
    this.name = 'AccountStateError';
  }
}

/**
 * Run it before the prompt of a circuit that takes a signature, on the state that the call is
 * built from. A key can change at any time, so a result is never reused.
 */
export async function checkAccCircuits(
  artifact: acc.AccArtifact,
  stateBytes: Uint8Array,
  circuits: readonly string[],
): Promise<void> {
  try {
    const onChain = await acc.readDeployedCircuits(stateBytes);
    acc.requireCircuits(artifact.manifest, onChain, circuits);
  } catch (e) {
    if (e instanceof acc.CircuitNotDeployedError)
      throw new CircuitNotDeployedError(e.circuit, e.arm);
    if (e instanceof acc.VerifierKeyMismatchError) throw new VerifierKeyMismatchError(e.circuit);
    // The runtime's text says nothing that the caller can act on.
    if (e instanceof acc.AccountStateError) throw new AccountStateError();
    throw e;
  }
}

/**
 * Resolves with the serialized unproven transaction. It refuses a missing or changed circuit
 * before it loads midnight-js. A midnight-js failure is an `UpstreamError`.
 */
export async function buildAccCall(input: AccCallInput): Promise<Uint8Array> {
  await checkAccCircuits(input.artifact, input.state.bytes, [input.circuit]);
  return Effect.runPromise(unprovenAccCall(input));
}
