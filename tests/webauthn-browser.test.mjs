import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { addAuthenticator, browserTest, runPage } from './chromium.mjs';

const PAGE = `
  import { browserPlatform } from './index.js';
  const rp = { id: 'localhost', name: 'Test' };
  const user = { id: new Uint8Array([1, 2, 3, 4]), name: 'u', displayName: 'U' };
  const challenge = () => crypto.getRandomValues(new Uint8Array(32));
  const outcome = (call) =>
    call.then(() => 'resolved', (e) => [e._tag, e.by ?? e.reason].join(' '));
  window.createOnly = () => outcome(browserPlatform().webauthn.create({ rp, user, challenge: challenge() }));
  window.getOnly = () => outcome(browserPlatform().webauthn.get({ rpId: rp.id, challenge: challenge(), allowCredentialIds: [new Uint8Array([7])], timeoutMs: 2000 }));
  window.run = async () => {
    const { webauthn } = browserPlatform();
    const created = await webauthn.create({ rp, user, challenge: challenge() });
    const ids = [created.credentialId];
    const asserted = await webauthn.get({ rpId: rp.id, challenge: challenge(), allowCredentialIds: ids });
    return {
      publicKey: [created.publicKey?.[0], created.publicKey?.length],
      sameCredential: asserted.credentialId.join() === created.credentialId.join(),
      userHandle: Array.from(asserted.userHandle ?? []),
      signatureIsDer: asserted.signature[0] === 0x30,
      userVerified: (asserted.authenticatorData[32] & 0x04) !== 0,
      // CBOR: a map whose first entry is "fmt": "none".
      noAttestation: created.attestationObject.slice(1, 10).join() === '99,102,109,116,100,110,111,110,101',
      excluded: await outcome(webauthn.create({ rp, user, challenge: challenge(), excludeCredentialIds: ids })),
      notAllowed: await outcome(
        webauthn.get({ rpId: rp.id, challenge: challenge(), allowCredentialIds: [new Uint8Array([9])], timeoutMs: 2000 }),
      ),
      aborted: await outcome(webauthn.get({ rpId: rp.id, challenge: challenge(), signal: AbortSignal.abort() })),
      abortedDuring: await (() => {
        const controller = new AbortController();
        const call = outcome(webauthn.create({ rp, user: { ...user, id: new Uint8Array([5]) }, challenge: challenge(), signal: controller.signal }));
        controller.abort();
        return call;
      })(),
      // The abort comes after the browser made the credential.
      abortedLate: await (async () => {
        const controller = new AbortController();
        const create = navigator.credentials.create.bind(navigator.credentials);
        navigator.credentials.create = (options) =>
          create(options).then((credential) => (controller.abort(), credential));
        const late = { rp, user: { ...user, id: new Uint8Array([6]) }, challenge: challenge(), signal: controller.signal };
        return outcome(webauthn.create(late)).finally(() => (navigator.credentials.create = create));
      })(),
    };
  };
`;

// The credential that `getOnly` asks for, so that only the missing user verification can fail the get.
const CREDENTIAL = {
  credentialId: Buffer.from([7]).toString('base64'),
  isResidentCredential: true,
  rpId: 'localhost',
  privateKey: generateKeyPairSync('ec', { namedCurve: 'P-256' })
    .privateKey.export({ type: 'pkcs8', format: 'der' })
    .toString('base64'),
  userHandle: Buffer.from([1, 2, 3, 4]).toString('base64'),
  signCount: 0,
};

/** @param {boolean} verifies */
const authenticator = (verifies) => async (/** @type {import('./chromium.mjs').Page} */ page) => {
  const authenticatorId = await addAuthenticator(page, verifies);
  if (!verifies) {
    await page.send('WebAuthn.addCredential', { authenticatorId, credential: CREDENTIAL });
  }
};

browserTest(
  'WebAuthn creates an ES256 credential and gets an assertion, and maps each error',
  async (bin) => {
    const { value, errors } = await runPage(bin, PAGE, {
      before: authenticator(true),
      expression: 'window.run()',
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(value, {
      publicKey: [0x30, 91],
      sameCredential: true,
      userHandle: [1, 2, 3, 4],
      signatureIsDer: true,
      userVerified: true,
      noAttestation: true,
      excluded: 'WebAuthnError InvalidStateError',
      notAllowed: 'CancelledError user',
      aborted: 'CancelledError caller',
      abortedDuring: 'CancelledError caller',
      abortedLate: 'CancelledError caller',
    });
  },
);

browserTest(
  'create and get need user verification, so an authenticator without it fails',
  async (bin) => {
    const { value, errors } = await runPage(bin, PAGE, {
      before: authenticator(false),
      expression: '(async () => [await window.createOnly(), await window.getOnly()])()',
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(value, ['CancelledError user', 'CancelledError user']);
  },
);
