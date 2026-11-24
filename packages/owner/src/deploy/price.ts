import type { WaveKind, WavePrice } from './plan.js';

export type Ledger = typeof import('@midnightntwrk/ledger-v9');

// The ACC keys of compact 0.36.1 carry the `verifier-key[v7]` header, which ledger-v9 calls v4.
export const VERIFIER_KEY_VERSION = 'v4';

export interface WavePriceOptions {
  /** From the chain. `LedgerParameters.initialParameters()` matches no live chain. */
  readonly ledgerParameters: Uint8Array;
  readonly networkId: string;
  readonly verifierKeys: ReadonlyMap<string, Uint8Array>;
  /** A serialized `ContractState` with the constructor's data. Without it, a deploy is priced with no data. */
  readonly initialState?: Uint8Array;
}

/**
 * Prices the unproven transaction of a wave. The sponsor's fee and the proofs
 * of a deploy are not in it, so the caller keeps headroom.
 */
export function createWavePrice(ledger: Ledger, options: WavePriceOptions): WavePrice {
  const params = ledger.LedgerParameters.deserialize(options.ledgerParameters);
  const key = (circuit: string): Uint8Array => {
    const bytes = options.verifierKeys.get(circuit);
    if (bytes === undefined) throw new RangeError(`No verifier key for ${circuit}.`);
    return bytes;
  };
  // A throwaway authority: an update's signature has the same size under any key.
  const signer = ledger.sampleSigningKey();
  const authority = new ledger.ContractMaintenanceAuthority(
    [ledger.signatureVerifyingKey(signer)],
    1,
    0n,
  );
  const address = ledger.sampleContractAddress();
  const ttl = (): Date => new Date(Date.now() + 60_000);

  const intent = (kind: WaveKind, circuits: readonly string[]) => {
    if (kind === 'deploy') {
      const state = new ledger.ContractState();
      if (options.initialState !== undefined) {
        state.data = ledger.ContractState.deserialize(options.initialState).data;
      }
      state.maintenanceAuthority = authority;
      for (const circuit of circuits) {
        const op = new ledger.ContractOperation();
        op.verifierKey = key(circuit);
        state.setOperation(circuit, op);
      }
      return ledger.Intent.new(ttl()).addDeploy(new ledger.ContractDeploy(state));
    }
    const update = new ledger.MaintenanceUpdate(
      address,
      circuits.map(
        (circuit) =>
          new ledger.VerifierKeyInsert(
            circuit,
            new ledger.ContractOperationVersionedVerifierKey(VERIFIER_KEY_VERSION, key(circuit)),
          ),
      ),
      0n,
    );
    return ledger.Intent.new(ttl()).addMaintenanceUpdate(
      update.addSignature(0n, ledger.signData(signer, update.dataToSign)),
    );
  };

  return (kind, circuits) => {
    const tx = ledger.Transaction.fromParts(
      options.networkId,
      undefined,
      undefined,
      intent(kind, circuits),
    );
    let share: Record<string, number>;
    try {
      share = params.normalizeFullness(tx.cost(params));
    } catch {
      // It throws when any block limit is exceeded.
      return Number.POSITIVE_INFINITY;
    }
    return Math.max(...Object.values(share));
  };
}
