import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CancelledError, UpstreamError, type Platform } from '@midnight-ntwrk/mn-passport-core';
import {
  createStubPlatform,
  platformContract,
  type PlatformHarness,
} from '@midnight-ntwrk/mn-passport-dev';
import { expectFailing, run } from './run.js';

const okUrl = 'https://example.test/ok';
const notFoundUrl = 'https://example.test/missing';
const redirectUrl = 'https://example.test/moved';
const pendingUrl = 'https://example.test/pending';
const harness = (
  webauthn: boolean,
  wrap: (p: Platform) => Platform = (p) => p,
): PlatformHarness => {
  const stub = createStubPlatform({
    webauthn,
    http: (request) =>
      request.url === pendingUrl
        ? new Promise(() => {})
        : Promise.resolve({
            status: request.url === okUrl ? 200 : request.url === redirectUrl ? 302 : 404,
            headers: request.url === redirectUrl ? { location: okUrl } : {},
            body: new Uint8Array(),
          }),
  });
  return {
    platform: wrap(stub),
    okUrl,
    notFoundUrl,
    redirectUrl,
    pendingUrl,
    dismissNextPrompt: () => stub.dismissNextPrompt(),
  };
};
run(
  'stub platform with WebAuthn',
  platformContract(async () => harness(true)),
);

const noWipe = (p: Platform): Platform => ({ ...p, store: { ...p.store, wipe: async () => {} } });
expectFailing(
  'the platform contract fails a wipe that leaves entries',
  platformContract(async () => harness(false, noWipe)),
  [['wipe leaves no key', 'wipe left a, b']],
);

const strict = (p: Platform): Platform => ({
  ...p,
  async http(request) {
    const response = await p.http(request);
    if (response.status === 404) throw new UpstreamError({ sourceTag: 'Test' });
    return response;
  },
});
expectFailing(
  'the platform contract fails an http that rejects a 404',
  platformContract(async () => harness(false, strict)),
  [
    [
      'http resolves with the status of the server, 404 included, and rejects a redirect',
      'An upstream call failed',
    ],
  ],
);

const caller = (p: Platform): Platform => {
  const { webauthn } = p;
  if (!webauthn) return p;
  const relabel = (error: unknown) => {
    throw error instanceof CancelledError ? new CancelledError('caller') : error;
  };
  return {
    ...p,
    webauthn: {
      create: (o) => webauthn.create(o).catch(relabel),
      get: (o) => webauthn.get(o).catch(relabel),
    },
  };
};
expectFailing(
  'the platform contract fails a dismissed prompt that reads as a caller cancel',
  platformContract(async () => harness(true, caller)),
  [['a dismissed WebAuthn prompt rejects with CancelledError by the user', 'expected by: user']],
);

// Other tests assert "no request" through this log and this default, so a gap here hides a leak.
test('the stub platform logs each request, and by default rejects it', async () => {
  const platform = createStubPlatform();
  await assert.rejects(platform.http({ url: okUrl, method: 'GET' }), /does not expect/);
  platform.answer(async () => ({ status: 204, headers: {}, body: new Uint8Array() }));
  const controller = new AbortController();
  controller.abort();
  const aborted = platform.http({ url: pendingUrl, method: 'POST', signal: controller.signal });
  await assert.rejects(aborted, { _tag: 'CancelledError' });
  assert.equal((await platform.http({ url: okUrl, method: 'GET' })).status, 204);
  assert.deepEqual(
    platform.requests.map((request) => request.url),
    [okUrl, pendingUrl, okUrl],
  );
});

test('the stub platform can fail or hang loadRuntimes', async () => {
  const platform = createStubPlatform();
  await platform.loadRuntimes();
  platform.loadFails(new Error('no WASM'));
  await assert.rejects(platform.loadRuntimes(), /no WASM/);
  platform.loadHangs();
  const settled = await Promise.race([
    platform.loadRuntimes().then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 20)),
  ]);
  assert.equal(settled, false);
});
