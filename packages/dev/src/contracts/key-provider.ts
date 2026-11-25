import type { KeyProvider } from '@midnight-ntwrk/mn-passport-core';
import { check, expectCancel, expectRejection, guarded, type ContractCase } from '../contract.js';

export interface KeyProviderHarness {
  readonly provider: KeyProvider;
  /** Makes the next prompt end as if the user dismissed it. */
  readonly dismissNextPrompt: () => void;
  /** Makes the next call stay in flight until its signal aborts. */
  readonly hold: () => void;
}

const challenge = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
// k256 and p256: the account contract reads x and y, and r and s, as 32 bytes each.
const sizeOk = (scheme: KeyProvider['scheme'], bytes: Uint8Array): boolean =>
  scheme === 'jubjub' ? bytes.length > 0 : bytes.length === 64;

export function keyProviderContract(
  make: () => Promise<KeyProviderHarness>,
  guardMs = 10_000,
): ContractCase[] {
  return guarded(
    [
      {
        name: 'publicKey gives the same key on each call',
        async run() {
          const { provider } = await make();
          const first = await provider.publicKey();
          const second = await provider.publicKey();
          check(sizeOk(provider.scheme, first), `the public key has ${first.length} bytes`);
          check(first.join() === second.join(), 'the public key changed between calls');
        },
      },
      {
        name: 'sign gives an authorization of the provider scheme',
        async run() {
          const { provider } = await make();
          const authorization = await provider.sign(challenge);
          check(authorization.scheme === provider.scheme, `got scheme ${authorization.scheme}`);
          const { signature } = authorization;
          check(sizeOk(provider.scheme, signature), `the signature has ${signature.length} bytes`);
          if (authorization.scheme === 'k256' && provider.scheme === 'k256') {
            check(authorization.envelope === provider.envelope, 'the envelope changed');
          }
          if (authorization.scheme === 'p256') {
            const { authenticatorData, clientDataJSON } = authorization;
            check(
              authenticatorData.length > 0 && clientDataJSON.length > 0,
              'the assertion is empty',
            );
          }
        },
      },
      {
        name: 'an abort before or during sign or publicKey rejects with CancelledError',
        async run() {
          const { provider, hold } = await make();
          await expectCancel((signal) => provider.sign(challenge, { signal }), hold);
          await expectCancel((signal) => provider.publicKey({ signal }), hold);
        },
      },
      {
        name: 'a dismissed prompt rejects with CancelledError by the user',
        async run() {
          const { provider, dismissNextPrompt } = await make();
          dismissNextPrompt();
          const error = await expectRejection(() => provider.sign(challenge), 'CancelledError');
          check('by' in error && error.by === 'user', 'expected by: user');
        },
      },
    ],
    guardMs,
  );
}
