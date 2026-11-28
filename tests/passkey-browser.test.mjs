import assert from 'node:assert/strict';
import { addAuthenticator, appBuild, browserTest, runPage } from './chromium.mjs';

const PAGE = `
  import { browserPlatform } from '@midnight-ntwrk/mn-passport-adapter-browser';
  import { createPasskey, passkeyProvider } from '@midnight-ntwrk/mn-passport-owner';
  window.run = async (n) => {
    const platform = browserPlatform();
    let prompts = 0;
    const counted = {
      create: (options) => (prompts++, platform.webauthn.create(options)),
      get: (options) => (prompts++, platform.webauthn.get(options)),
    };
    const origin = location.origin;
    const site = { platform: { ...platform, webauthn: counted }, rpId: 'localhost', origin, originLength: origin.length };
    const { passkey } = await createPasskey({ ...site, rpName: 'Test', user: { name: 'u', displayName: 'U' } });
    const provider = passkeyProvider({ ...site, ...passkey });
    const out = { created: prompts, signed: 0, grease: 0, refused: [] };
    for (let i = 0; i < n; i++) {
      try {
        const auth = await provider.sign(crypto.getRandomValues(new Uint8Array(32)));
        out.signed++;
        if (new TextDecoder().decode(auth.clientDataJSON).includes('other_keys_can_be_added_here')) out.grease++;
      } catch (error) {
        out.refused.push(error._tag + ' ' + error.reason);
      }
    }
    return { ...out, prompts };
  };
`;

browserTest(
  'each Chromium assertion fits the circuit profile, with one prompt each',
  async (bin, t) => {
    const { value, errors } = await runPage(bin, PAGE, {
      before: async (page) => {
        await addAuthenticator(page, true);
      },
      expression: 'window.run(200)',
      build: appBuild,
    });
    assert.deepEqual(errors, []);
    t.diagnostic(JSON.stringify(value));
    assert.ok(value && typeof value === 'object');
    const { created, signed, grease, refused, prompts } = /** @type {{ created: number,
      signed: number, grease: number, refused: string[], prompts: number }} */ (value);
    assert.equal(created, 1);
    assert.equal(prompts, 201);
    // Chromium adds its GREASE member at random. The circuit accepts both shapes.
    assert.deepEqual(refused, []);
    assert.equal(signed, 200);
    assert.ok(grease > 0, 'Chromium sent no GREASE member in 200 assertions');
  },
);
