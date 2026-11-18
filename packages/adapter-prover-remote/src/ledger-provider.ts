import type { ProvingKeyMaterial, ProvingProvider } from '@midnightntwrk/ledger-v9';
import { PassportError, UpstreamError } from '@midnight-ntwrk/mn-passport-core';
import { ProverRejectedError } from './errors.js';
import { parseKeyLocation, type KeyLocation, type ParsedKeyLocation } from './key-location.js';
import { untilEnded, type Call, type Transport } from './transport.js';

interface SubtleDigest {
  digest(algorithm: 'SHA-256', data: Uint8Array): Promise<ArrayBuffer>;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const { subtle } = (globalThis as typeof globalThis & { crypto: { subtle: SubtleDigest } })
    .crypto;
  const digest = new Uint8Array(await subtle.digest('SHA-256', data));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface LedgerProviderOptions {
  readonly transport: Transport;
  readonly call: Call;
  /** `<address>/<entry point>` of each contract call, from the transaction itself. */
  readonly calls: ReadonlySet<string>;
  readonly verifierKey: (location: KeyLocation) => Promise<Uint8Array>;
  readonly parseCheckResult: (result: Uint8Array) => (bigint | undefined)[];
}

export interface LedgerProvider {
  readonly provider: ProvingProvider;
  /** The first error of a callback. The ledger gives it back only as a string. */
  kept(): { readonly error: unknown } | undefined;
}

export function createLedgerProvider(options: LedgerProviderOptions): LedgerProvider {
  const { transport, call } = options;
  let kept: { readonly error: unknown } | undefined;
  const keep = async <A>(work: () => Promise<A>): Promise<A> => {
    try {
      return await work();
    } catch (error) {
      kept ??= { error };
      // The ledger runs the calls at once. Ending the call stops the others from sending.
      call.fail(
        error instanceof PassportError ? error : new UpstreamError({ sourceTag: 'callback' }),
      );
      throw error;
    }
  };
  const verified = new Map<string, Promise<Uint8Array>>();
  const verify = (location: string, parsed: KeyLocation): Promise<Uint8Array> => {
    let key = verified.get(location);
    if (key === undefined) {
      key = untilEnded(call, () => options.verifierKey(parsed)).then(async (verifierKey) => {
        if ((await sha256Hex(verifierKey)) !== parsed.verifierKeyHash) {
          throw new ProverRejectedError('verifier-key-mismatch');
        }
        return verifierKey;
      });
      verified.set(location, key);
    }
    return key;
  };
  const checked = new Set<string>();
  // Runs before a preimage leaves the client. The label is the author's choice, so it
  // must name a call of the transaction, and a built-in comes to `prove` only.
  const allow = async (
    location: string,
    route: 'check' | 'lookupKey' | 'prove',
  ): Promise<Uint8Array | undefined> => {
    const parsed: ParsedKeyLocation = parseKeyLocation(location);
    if (parsed.kind === 'builtin') {
      if (route !== 'prove') throw new ProverRejectedError('input');
      return undefined;
    }
    const { contractAddress, circuitId, verifierKeyHash } = parsed;
    if (!options.calls.has(`${contractAddress}/${circuitId}`)) {
      throw new ProverRejectedError('undeclared-circuit');
    }
    if (route === 'check') checked.add(location);
    else if (!checked.has(location)) throw new ProverRejectedError('input');
    return verify(location, { contractAddress, circuitId, verifierKeyHash });
  };
  const provider: ProvingProvider = {
    check: (preimage, location) =>
      keep(async () => {
        await allow(location, 'check');
        const body = await transport('check', { key: location }, preimage, call);
        try {
          return options.parseCheckResult(body);
        } catch {
          throw new UpstreamError({ sourceTag: 'parseCheckResult' });
        }
      }),
    lookupKey: (location) =>
      keep(async (): Promise<ProvingKeyMaterial | undefined> => {
        const verifierKey = await allow(location, 'lookupKey');
        if (verifierKey === undefined) return undefined;
        // The ledger reads only the verifier key. The service holds the prover key and the ZKIR.
        return { proverKey: new Uint8Array(), verifierKey, ir: new Uint8Array() };
      }),
    prove: (preimage, location, bindingInput) =>
      keep(async () => {
        await allow(location, 'prove');
        const query =
          bindingInput === undefined
            ? { key: location }
            : { key: location, binding: bindingInput.toString() };
        return transport('prove', query, preimage, call);
      }),
  };
  return { provider, kept: () => kept };
}
