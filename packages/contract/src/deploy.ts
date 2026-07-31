// The typed deploy caller (FS-0.2 T2, D-5). The ACC has no deploy circuit:
// deployment is the Compact constructor, so this shapes constructor
// arguments — the commitments are derived kernel-side (under the ceremony)
// with the artefact's pure circuits; secrets never reach this package.
import { BINDING_VERSION, assertBindingCompatible } from './registry.js';

/** The deploy inputs, as commitments — never secrets (architecture §4.1). */
export interface AccDeployInputs {
  /** Via derive_device_commitment over the device secret (kernel-side). */
  readonly initialDeviceCommitment: bigint;
  /** Via derive_recovery_commitment over the recovery secret (kernel-side). */
  readonly recoveryCommitment: bigint;
}

/** Ordered constructor arguments plus the binding they deploy. */
export interface AccDeployArgs {
  /** A member of `SUPPORTED_BINDINGS`, validated before construction. */
  readonly bindingVersion: string;
  /**
   * Positional Compact constructor arguments —
   * `constructor(initial_device_commitment, recovery_commitment)`. The
   * order is the contract's, and it matters.
   */
  readonly constructorArgs: readonly [bigint, bigint];
}

/**
 * Shapes the ACC deploy call for a supported binding version (new deploys
 * default to the registry's `current`); throws
 * {@link import('./registry.js').UnsupportedBindingError} for anything
 * else. FS-1.1's call
 * construction turns the result into the deployment transaction, and
 * FS-1.2's onboarding flow records `bindingVersion` as the account's
 * version (spec §4.1).
 */
export function buildDeployArgs(
  inputs: AccDeployInputs,
  bindingVersion: string = BINDING_VERSION,
): AccDeployArgs {
  assertBindingCompatible(bindingVersion);
  return {
    bindingVersion,
    constructorArgs: [inputs.initialDeviceCommitment, inputs.recoveryCommitment],
  };
}
