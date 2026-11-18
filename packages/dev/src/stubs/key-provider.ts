import {
  CancelledError,
  type Authorization,
  type CallOptions,
  type KeyProvider,
} from '@midnight-ntwrk/mn-passport-core';
import { createHold } from '../abort.js';

export type StubKeyOptions =
  { readonly scheme: 'jubjub' | 'p256' } | { readonly scheme: 'k256'; readonly envelope: 0 | 1 };

export type StubKeyProvider = KeyProvider & {
  /** The next `sign` acts as if the user dismissed the prompt. */
  dismissNextPrompt(): void;
  /** The next call stays in flight until its signal aborts. */
  holdNext(): void;
};

/** Its signatures are filler bytes that no verifier accepts. */
export function createStubKeyProvider(options: StubKeyOptions): StubKeyProvider {
  const publicKey = new Uint8Array(64).fill(options.scheme.length);
  const hold = createHold();
  let dismiss = false;

  const authorize = (challenge: Uint8Array): Authorization => {
    const signature = Uint8Array.from({ length: 64 }, (_, i) => challenge[i % 32] ?? 0);
    if (options.scheme === 'k256') return { scheme: 'k256', envelope: options.envelope, signature };
    if (options.scheme === 'jubjub') return { scheme: 'jubjub', signature };
    return {
      scheme: 'p256',
      signature,
      authenticatorData: new Uint8Array(37),
      clientDataJSON: new Uint8Array(134),
    };
  };

  return {
    ...options,
    publicKey: (callOptions?: CallOptions) =>
      hold.run(callOptions?.signal, () => publicKey.slice()),
    sign: (challenge: Uint8Array, callOptions?: CallOptions) =>
      hold.run(callOptions?.signal, () => {
        if (!dismiss) return authorize(challenge);
        dismiss = false;
        throw new CancelledError('user');
      }),
    dismissNextPrompt() {
      dismiss = true;
    },
    holdNext: () => hold.next(),
  };
}
