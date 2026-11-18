import {
  CancelledError,
  PassportError,
  UpstreamError,
  type Platform,
  type Prover,
} from '@midnight-ntwrk/mn-passport-core';
import { ProverRejectedError } from './errors.js';
import type { KeyLocation } from './key-location.js';
import { createLedgerProvider } from './ledger-provider.js';
import { checkTimeout, createTransport, openCall, untilEnded } from './transport.js';

export interface RemoteProverOptions {
  /** `https:`, or `http:` on a loopback host. */
  readonly url: string;
  readonly platform: Platform;
  /** The deployed verifier key. Its SHA-256 must match `verifierKeyHash`. */
  readonly verifierKey: (location: KeyLocation) => Promise<Uint8Array>;
  /** Called for each request. The value is sent as a bearer token. */
  readonly credential?: () => Promise<string>;
  /** The deadline of each `prove` call when the caller gives no `timeoutMs`. */
  readonly defaultTimeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 300_000;

// Its text can hold a preimage or a key, so only a fixed tag passes.
const upstream = (sourceTag: string) => (error: unknown) => {
  throw error instanceof PassportError ? error : new UpstreamError({ sourceTag });
};

/**
 * The service sees the inputs of each declared call and each built-in coin preimage.
 * A rejection of `verifierKey` or `credential` rejects `prove` with the same error.
 */
export function remoteProver(options: RemoteProverOptions): Prover {
  const { platform, verifierKey } = options;
  const defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  checkTimeout(defaultTimeoutMs);
  const transport = createTransport({
    url: options.url,
    platform,
    ...(options.credential ? { credential: options.credential } : {}),
  });
  return {
    async prove(tx, circuitIds, callOptions) {
      if (callOptions?.signal?.aborted) throw new CancelledError('caller');
      const call = openCall(callOptions?.signal, callOptions?.timeoutMs ?? defaultTimeoutMs);
      try {
        await untilEnded(call, () => platform.loadRuntimes()).catch(upstream('loadRuntimes'));
        const ledger = await untilEnded(call, () => import('@midnightntwrk/ledger-v9')).catch(
          upstream('ledger-v9'),
        );
        const deserialize = () =>
          ledger.Transaction.deserialize('signature', 'pre-proof', 'pre-binding', tx.bytes);
        let unproven: ReturnType<typeof deserialize>;
        try {
          unproven = deserialize();
        } catch {
          throw new ProverRejectedError('input');
        }
        const calls = new Set<string>();
        for (const intent of unproven.intents?.values() ?? []) {
          for (const action of intent.actions) {
            if (!(action instanceof ledger.ContractCall)) continue;
            const { entryPoint } = action;
            if (typeof entryPoint !== 'string' || !circuitIds.includes(entryPoint)) {
              throw new ProverRejectedError('undeclared-circuit');
            }
            calls.add(`${action.address.toLowerCase()}/${entryPoint}`);
          }
        }
        const { provider, kept } = createLedgerProvider({
          transport,
          call,
          calls,
          verifierKey,
          parseCheckResult: ledger.parseCheckResult,
        });
        const proven = await untilEnded(call, () =>
          unproven.prove(provider, ledger.CostModel.initialCostModel()),
        ).catch((error: unknown) => {
          const first = kept()?.error ?? call.ended();
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- A callback's own error passes through unchanged.
          if (first !== undefined) throw first;
          return upstream('Transaction.prove')(error);
        });
        try {
          return { stage: 'proven', bytes: proven.serialize() };
        } catch (error) {
          return upstream('Transaction.serialize')(error);
        }
      } finally {
        call.close();
      }
    },
  };
}
