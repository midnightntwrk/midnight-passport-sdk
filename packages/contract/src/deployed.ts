import { AccountStateError, CircuitNotDeployedError, VerifierKeyMismatchError } from './errors.js';
import type { AccArm, AccManifest } from './manifest.js';
import { sha256 } from './sha256.js';

export type AccGroup = AccArm | 'shared';

export type ArmState = 'complete' | 'partial' | 'absent';

export interface ArmsReport {
  /** Counts only the circuits whose on-chain key is the pinned one. */
  readonly arms: Readonly<Record<AccGroup, ArmState>>;
  /** The circuits of the build that are not on chain. */
  readonly missing: Readonly<Record<AccGroup, readonly string[]>>;
  /** On chain, but with another verifier key. No call can use them. */
  readonly changed: readonly string[];
}

const GROUPS = ['shared', 'jubjub', 'k256', 'p256'] as const;

const perGroup = <T>(make: (group: AccGroup) => T): Record<AccGroup, T> => ({
  shared: make('shared'),
  jubjub: make('jubjub'),
  k256: make('k256'),
  p256: make('p256'),
});

const pinnedKey = (manifest: AccManifest, circuit: string): string | undefined =>
  manifest.files.get(`keys/${circuit}.verifier`)?.sha256;

/**
 * Maps each on-chain circuit to the SHA-256 of its verifier key. It keeps names that no
 * manifest lists, and leaves out an operation with no key.
 */
export async function readDeployedCircuits(
  stateBytes: Uint8Array,
): Promise<ReadonlyMap<string, string>> {
  // Loaded here, so that opening the artifact loads no WASM.
  const { ContractState } = await import('@midnight-ntwrk/compact-runtime');
  let state: InstanceType<typeof ContractState>;
  try {
    state = ContractState.deserialize(stateBytes);
  } catch (cause) {
    throw new AccountStateError({ cause });
  }
  const circuits = new Map<string, string>();
  for (const id of state.operations()) {
    // The type says `Uint8Array`, but an operation made with no key reads `undefined`.
    const key: Uint8Array | undefined = state.operation(id)?.verifierKey;
    if (key === undefined) continue;
    // The ACC names its circuits in ASCII.
    circuits.set(typeof id === 'string' ? id : String.fromCharCode(...id), await sha256(key));
  }
  return circuits;
}

/** A missing arm is `absent`, never an error. */
export function armsOf(manifest: AccManifest, onChain: ReadonlyMap<string, string>): ArmsReport {
  const usable = (circuit: string): boolean => {
    const pinned = pinnedKey(manifest, circuit);
    return pinned !== undefined && onChain.get(circuit) === pinned;
  };
  return {
    arms: perGroup((group): ArmState => {
      const all = manifest.circuits[group];
      const count = all.filter(usable).length;
      if (count === all.length) return 'complete';
      return count === 0 ? 'absent' : 'partial';
    }),
    missing: perGroup((group) => manifest.circuits[group].filter((c) => !onChain.has(c))),
    changed: GROUPS.flatMap((group) =>
      manifest.circuits[group].filter((c) => onChain.has(c) && !usable(c)),
    ),
  };
}

/**
 * Run it on the same state that the call is built from, before any prompt, signature, or proof.
 * The maintenance authority can change a key at any time, so a result is never reused.
 */
export function requireCircuits(
  manifest: AccManifest,
  onChain: ReadonlyMap<string, string>,
  circuits: readonly string[],
): void {
  for (const circuit of circuits) {
    const pinned = pinnedKey(manifest, circuit);
    const actual = onChain.get(circuit);
    if (pinned === undefined || actual === undefined) {
      const arm = GROUPS.find((group) => manifest.circuits[group].includes(circuit));
      throw new CircuitNotDeployedError(circuit, arm);
    }
    if (actual !== pinned) throw new VerifierKeyMismatchError(circuit);
  }
}
