import type {
  AbortSignalLike,
  Platform,
  WebAuthnCreateOptions,
  WebAuthnGetOptions,
} from '@midnight-ntwrk/mn-passport-core';
import { check, expectCancel, expectRejection, guarded, type ContractCase } from '../contract.js';

export interface PlatformHarness {
  readonly platform: Platform;
  /** A URL that answers a GET with 200. */
  readonly okUrl: string;
  /** A URL that answers a GET with 404. */
  readonly notFoundUrl: string;
  /** A URL that answers a GET with a redirect to `okUrl`. */
  readonly redirectUrl: string;
  /** A URL that takes the request and never answers. */
  readonly pendingUrl: string;
  /** Makes the next WebAuthn prompt end as if the user dismissed it. Needed when `webauthn` is defined. */
  readonly dismissNextPrompt?: () => void;
}

const createOptions: WebAuthnCreateOptions = {
  rp: { id: 'example.test', name: 'Test' },
  user: { id: new Uint8Array(16), name: 'user', displayName: 'User' },
  challenge: new Uint8Array(32),
};
const getOptions: WebAuthnGetOptions = { rpId: 'example.test', challenge: new Uint8Array(32) };

const same = (a: Uint8Array | undefined, b: Uint8Array): boolean =>
  a?.length === b.length && a.every((byte, i) => byte === b[i]);

/** The random case cannot tell a counter from a cryptographic source. */
export function platformContract(
  make: () => Promise<PlatformHarness>,
  guardMs = 10_000,
): ContractCase[] {
  return guarded(
    [
      {
        name: 'the store keeps, lists, and deletes values',
        async run() {
          const { store } = (await make()).platform;
          const value = new Uint8Array([1, 2, 3]);
          await store.set('a', value);
          value[0] = 9;
          check(same(await store.get('a'), new Uint8Array([1, 2, 3])), 'the store lost the value');
          check((await store.get('missing')) === undefined, 'a missing key has a value');
          check((await store.keys()).includes('a'), 'keys() does not list the key');
          await store.delete('a');
          check((await store.get('a')) === undefined, 'delete left the value');
        },
      },
      {
        name: 'a key over 120 UTF-8 bytes rejects with TypeError',
        async run() {
          const { store } = (await make()).platform;
          // Two bytes per character, so a limit on characters fails.
          const longest = '\u00e9'.repeat(60);
          await store.set(longest, new Uint8Array([1]));
          check((await store.get(longest)) !== undefined, 'a 120-byte key lost its value');
          const tooLong = `${longest}a`;
          for (const call of [
            () => store.get(tooLong),
            () => store.set(tooLong, new Uint8Array()),
            () => store.delete(tooLong),
          ]) {
            const error = await call().then(
              () => undefined,
              (e: unknown) => e,
            );
            check(error instanceof TypeError, `a 121-byte key gave ${String(error)}`);
          }
        },
      },
      {
        name: 'wipe leaves no key',
        async run() {
          const { store } = (await make()).platform;
          await store.set('a', new Uint8Array([1]));
          await store.set('b', new Uint8Array([2]));
          await store.wipe();
          const keys = await store.keys();
          check(keys.length === 0, `wipe left ${keys.join(', ')}`);
        },
      },
      {
        name: 'randomBytes gives the length asked for, and new bytes on each call',
        async run() {
          const { platform } = await make();
          const first = platform.randomBytes(32);
          check(first.length === 32, `got ${first.length} bytes`);
          check(!same(first, platform.randomBytes(32)), 'two calls gave the same bytes');
        },
      },
      {
        name: 'loadRuntimes can run twice',
        async run() {
          const { platform } = await make();
          await platform.loadRuntimes();
          await platform.loadRuntimes();
        },
      },
      {
        name: 'http resolves with the status of the server, 404 included, and rejects a redirect',
        async run() {
          const { platform, okUrl, notFoundUrl, redirectUrl } = await make();
          const ok = await platform.http({ url: okUrl, method: 'GET' });
          check(ok.status === 200, `got status ${ok.status}`);
          const missing = await platform.http({ url: notFoundUrl, method: 'GET' });
          check(missing.status === 404, `got status ${missing.status}`);
          await expectRejection(
            () => platform.http({ url: redirectUrl, method: 'GET' }),
            'NetworkError',
          );
        },
      },
      {
        name: 'an abort before or during http rejects with CancelledError',
        async run() {
          const { platform, pendingUrl } = await make();
          const get = (signal: AbortSignalLike) =>
            platform.http({ url: pendingUrl, method: 'GET', signal });
          await expectCancel(get, () => {});
        },
      },
      {
        name: 'a dismissed WebAuthn prompt rejects with CancelledError by the user',
        async run() {
          const { platform, dismissNextPrompt } = await make();
          const { webauthn } = platform;
          // A platform with no WebAuthn has no prompt to dismiss.
          if (webauthn === undefined) return;
          check(dismissNextPrompt !== undefined, 'the harness has no dismissNextPrompt');
          const prompts: (() => Promise<unknown>)[] = [
            () => webauthn.create(createOptions),
            () => webauthn.get(getOptions),
          ];
          for (const prompt of prompts) {
            dismissNextPrompt();
            const error = await expectRejection(prompt, 'CancelledError');
            check('by' in error && error.by === 'user', 'expected by: user');
          }
        },
      },
    ],
    guardMs,
  );
}
