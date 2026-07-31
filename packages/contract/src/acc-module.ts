// Structural typing over the generated ACC contract module (FS-0.2 T2,
// D-9). The generated module lives in the versioned artefact — it is not
// committed and depends on the Compact runtime, so this package never
// imports it statically: callers load the artefact (browser: fetch; dev:
// the local build) and bind it here to get the typed surface.

/**
 * The artefact's exported pure commitment circuits. These take **plaintext
 * secrets**: they must be invoked kernel-side only, under the §2.2
 * ceremony (architecture §4.1) — never from adapter or dApp code. This
 * package only *types* them; the commitments handed to
 * {@link import('./deploy.js').buildDeployArgs} are derived by the kernel.
 */
export interface AccPureCircuits {
  readonly derive_device_commitment: (secret: Uint8Array) => bigint;
  readonly derive_recovery_commitment: (secret: Uint8Array) => bigint;
  /** Grants arrive with their feature (spec §2 Out) — optional until then. */
  readonly derive_grant_commitment?: (secret: Uint8Array) => bigint;
}

/**
 * The witness-callback context, mirrored minimally: the generated module's
 * `WitnessContext` carries more (ledger view, contract address), and a
 * kernel implementation written against this narrower shape remains
 * assignable to it. `PS` is the private-state type the kernel defines
 * (FS-0.3) — unknown here because its owner does not exist yet.
 */
export interface AccWitnessContext<PS = unknown> {
  readonly privateState: PS;
}

/** The three ACC witnesses the kernel implements and hands to the constructor. */
export interface AccWitnesses<PS = unknown> {
  device_secret(context: AccWitnessContext<PS>): [PS, Uint8Array];
  grant_secret(context: AccWitnessContext<PS>): [PS, Uint8Array];
  recovery_secret(context: AccWitnessContext<PS>): [PS, Uint8Array];
}

/** A constructed contract instance — the deploy-relevant surface. */
export interface AccContractInstance {
  /**
   * The Compact constructor. `context` and the return value are
   * runtime-owned types (`ConstructorContext`/`ConstructorResult` from
   * `@midnight-ntwrk/compact-runtime`) that this package cannot import
   * (D-9: dependency-free, platform-neutral); FS-1.1's call construction
   * types them at the consumer, where the runtime is present.
   */
  initialState(
    context: unknown,
    initialDeviceCommitment: bigint,
    recoveryCommitment: bigint,
  ): unknown;
}

/** The structural surface of a generated ACC contract module. */
export interface AccContractModule {
  readonly pureCircuits: AccPureCircuits;
  /**
   * The private-state type `PS` is inferred from the witnesses the caller
   * constructs with — the kernel defines both (FS-0.3), so the type check
   * happens at the construction site, not asserted at bind time.
   */
  readonly Contract: new <PS>(witnesses: AccWitnesses<PS>) => AccContractInstance;
  /**
   * Projects raw contract state into the typed ledger view. Both sides are
   * runtime-owned (`StateValue` in, the generated `Ledger` out); the
   * structural ledger mirror lands with its first consumer (FS-1.1 reads
   * `round`/`auth_nonce`; M2 reads names) rather than speculatively here.
   */
  readonly ledger: (state: unknown) => unknown;
}

/**
 * Thrown when a loaded module does not have the ACC's generated shape.
 * Discriminate on {@link AccModuleShapeError.code}, which is stable.
 */
export class AccModuleShapeError extends Error {
  override readonly name = 'AccModuleShapeError';
  /** The stable machine-readable discriminant in the SDK error taxonomy. */
  readonly code = 'ACC_MODULE_SHAPE';
  constructor(
    /** Which part of the expected shape was missing or wrong. */
    readonly detail: string,
  ) {
    super(`The loaded module is not a generated ACC contract module — ${detail} (FS-0.2 D-9).`);
  }
}

const REQUIRED_PURE_CIRCUITS = ['derive_device_commitment', 'derive_recovery_commitment'] as const;

/**
 * Binds a runtime-loaded artefact module to the typed ACC surface, after
 * validating its shape and picking the validated properties into a frozen
 * object (so accessor tricks on the source cannot swap functions after
 * validation). **This is a shape check, not a trust boundary**: a hostile
 * module with the right shape passes, and the kernel would hand it
 * witnesses via `new Contract(witnesses)` — never bind a module from an
 * unverified source; byte integrity against the committed hashes is the
 * T3 loader's job.
 */
export function bindAccModule(module: unknown): AccContractModule {
  if (module === null || typeof module !== 'object') {
    throw new AccModuleShapeError('not an object');
  }
  const candidate = module as Record<string, unknown>;
  const contract = candidate.Contract;
  const ledger = candidate.ledger;
  if (typeof contract !== 'function') throw new AccModuleShapeError('missing the Contract class');
  if (typeof ledger !== 'function') throw new AccModuleShapeError('missing the ledger projection');
  const pure = candidate.pureCircuits as Record<string, unknown> | undefined;
  /** @type {Record<string, unknown>} */
  const pickedPure: Record<string, unknown> = {};
  for (const name of REQUIRED_PURE_CIRCUITS) {
    const fn = pure?.[name];
    if (typeof fn !== 'function') {
      throw new AccModuleShapeError(`missing the pure circuit ${name}`);
    }
    pickedPure[name] = fn;
  }
  if (typeof pure?.derive_grant_commitment === 'function') {
    pickedPure.derive_grant_commitment = pure.derive_grant_commitment;
  }
  return Object.freeze({
    pureCircuits: Object.freeze(pickedPure) as unknown as AccPureCircuits,
    Contract: contract as AccContractModule['Contract'],
    ledger: ledger as (state: unknown) => unknown,
  });
}
