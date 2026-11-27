import assert from 'node:assert/strict';
import { addAuthenticator, browserTest, runPage } from './chromium.mjs';

// Each case swaps in a browser call that returns a credential the adapter then refuses.
const PAGE = `
  import { browserPlatform } from './index.js';
  const { webauthn } = browserPlatform();
  const { credentials } = navigator;
  const [create, get] = [credentials.create.bind(credentials), credentials.get.bind(credentials)];
  const rp = { id: 'localhost', name: 'Test' };
  const user = (id) => ({ id: new Uint8Array([id]), name: 'u', displayName: 'U' });
  const challenge = () => crypto.getRandomValues(new Uint8Array(32));
  const prf = { first: new Uint8Array(32).fill(1) };
  const made = () => create({ publicKey: {
    rp, user: user(1), challenge: challenge(), pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    extensions: { prf: { eval: prf } },
  } });
  const asserted = async () => {
    const { rawId } = await made();
    return get({ publicKey: { rpId: rp.id, challenge: challenge(), allowCredentials: [{ type: 'public-key', id: rawId }], userVerification: 'required', extensions: { prf: { eval: prf } } } });
  };
  async function refused(swap, call) {
    let credential;
    credentials[swap.name] = () => swap.give().then((c) => ((credential = c), swap.after?.(), c));
    try {
      const error = await call().then(() => 'resolved', (e) => [e._tag, e.by ?? e.reason].join(' '));
      const first = new Uint8Array(credential.getClientExtensionResults().prf.results.first);
      return [error, first.length > 0 && first.every((x) => x === 0)];
    } finally {
      credentials.create = create;
      credentials.get = get;
    }
  }
  window.run = async () => {
    const controller = new AbortController();
    return {
      lateAbort: await refused(
        { name: 'create', give: made, after: () => controller.abort() },
        () => webauthn.create({ rp, user: user(2), challenge: challenge(), prf, signal: controller.signal }),
      ),
      noAttestation: await refused(
        { name: 'create', give: asserted },
        () => webauthn.create({ rp, user: user(3), challenge: challenge(), prf }),
      ),
      noAssertion: await refused(
        { name: 'get', give: made },
        () => webauthn.get({ rpId: rp.id, challenge: challenge(), prf }),
      ),
    };
  };
`;

browserTest('a refused ceremony zeros the PRF output that it drops', async (bin) => {
  const { value, errors } = await runPage(bin, PAGE, {
    before: async (page) => {
      await addAuthenticator(page, true);
    },
    expression: 'window.run()',
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(value, {
    lateAbort: ['CancelledError caller', true],
    noAttestation: ['WebAuthnError NoAttestation', true],
    noAssertion: ['WebAuthnError NoAssertion', true],
  });
});
