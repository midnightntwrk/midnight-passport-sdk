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
  const prompt = (callOptions: CallOptions | undefined, authorize: () => Authorization) =>
    hold.run(callOptions?.signal, () => {
      if (!dismiss) return authorize();
      dismiss = false;
      throw new CancelledError('user');
    });
  const filler = (c: Uint8Array, length: number) =>
    Uint8Array.from({ length }, (_, i) => c[i % 32] ?? 0);
  const controls = {
    publicKey: (callOptions?: CallOptions) =>
      hold.run(callOptions?.signal, () => publicKey.slice()),
    dismissNextPrompt() {
      dismiss = true;
    },
    holdNext: () => hold.next(),
  };

  if (options.scheme === 'jubjub') {
    return {
      ...controls,
      scheme: 'jubjub',
      sign: (challenge, callOptions) =>
        prompt(callOptions, () => {
          const commitment = new Uint8Array(64).fill(1);
          const { bytes, grindNonce } = challenge.bind(commitment);
          return { scheme: 'jubjub', commitment, response: filler(bytes, 32), grindNonce };
        }),
    };
  }
  if (options.scheme === 'k256') {
    const { envelope } = options;
    return {
      ...controls,
      scheme: 'k256',
      envelope,
      sign: (challenge, callOptions) =>
        prompt(callOptions, () => ({ scheme: 'k256', envelope, signature: filler(challenge, 64) })),
    };
  }
  return {
    ...controls,
    scheme: 'p256',
    sign: (challenge, callOptions) =>
      prompt(callOptions, () => ({
        scheme: 'p256',
        signature: filler(challenge, 64),
        authenticatorData: new Uint8Array(37),
        clientDataJSON: new Uint8Array(134),
      })),
  };
}
