// Automated ROR + PRF continuity check.
//
// One Chromium page (a single CDP target, so the virtual authenticator and
// its resident credential persist across navigations):
//   1. https://nightfi.test        — create a passkey under RP ID
//      midnightpassport.test (the Related Origin Request), evaluate PRF,
//      derive the P-256 public key, and write the simulated deployed-contract
//      address (32 random bytes) to the credential's largeBlob.
//   2. https://midnightpassport.test — discoverable-credential sign-in,
//      same PRF salt, derive again, and read the largeBlob back.
//   3. Assert both derived keys are identical AND the contract address
//      round-tripped through the passkey byte for byte.
//
// Requires the static server (e2e/serve.mjs) listening on 443 — the RP ID
// well-known fetch does not carry a port. Prints a JSON summary consumed by
// findings.md.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// A derived key is a compressed P-256 point: 33 bytes, 66 hex chars, 02/03
// prefix. Guarding the match with this shape prevents the two apps' identical
// "no PRF output" fallback strings from comparing equal as a false positive.
const P256_COMPRESSED_HEX = /^0[23][0-9a-f]{64}$/u;

const summary = {
  date: new Date().toISOString().slice(0, 10),
  browser: null,
  authenticator: 'CDP virtual authenticator (ctap2, internal, hasPrf, hasLargeBlob)',
  steps: {},
};

function step(name, value) {
  summary.steps[name] = value;
  console.log(`· ${name}: ${JSON.stringify(value)}`);
}

// Start the host-routing HTTPS server unless one is already up.
const server = spawn(process.execPath, [fileURLToPath(new URL('./serve.mjs', import.meta.url))], {
  stdio: 'inherit',
});
await sleep(700);

const browser = await chromium.launch({
  args: [
    '--host-resolver-rules=MAP midnightpassport.test 127.0.0.1, MAP nightfi.test 127.0.0.1',
    '--ignore-certificate-errors',
    '--no-sandbox',
  ],
});
summary.browser = `Chromium ${browser.version()} (Playwright)`;

try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      ctap2Version: 'ctap2_1',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      hasPrf: true,
      hasLargeBlob: true,
      automaticPresenceSimulation: true,
    },
  });

  // ── nightfi.test: onboard ──
  await page.goto('https://nightfi.test/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Create your Midnight Passport' }).click();
  const nightfiResult = await Promise.race([
    page.waitForSelector('[data-testid="pubkey"]', { timeout: 15000 }).then(() => 'ok'),
    page.waitForSelector('[data-testid="error"]', { timeout: 15000 }).then(() => 'error'),
  ]);
  if (nightfiResult === 'error') {
    step('nightfi.create-under-ror', `FAILED: ${await page.textContent('[data-testid="error"]')}`);
    throw new Error('create() under ROR failed at nightfi.test');
  }
  step('nightfi.create-under-ror', 'ok');
  step('nightfi.prf-enabled', await page.textContent('[data-testid="prf-enabled"]'));
  const nightfiKey = await page.textContent('[data-testid="pubkey"]');
  step('nightfi.derived-public-key', nightfiKey);
  step('nightfi.largeblob-supported', await page.textContent('[data-testid="largeblob-supported"]'));
  const deployedAddress = await page.textContent('[data-testid="acc-address"]');
  step('nightfi.deployed-contract-address', deployedAddress);
  step('nightfi.blob-written', await page.textContent('[data-testid="blob-written"]'));

  // ── midnightpassport.test: continue with passkey ──
  await page.goto('https://midnightpassport.test/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Continue with Passkey' }).click();
  const passportResult = await Promise.race([
    page.waitForSelector('[data-testid="pubkey"]', { timeout: 15000 }).then(() => 'ok'),
    page.waitForSelector('[data-testid="error"]', { timeout: 15000 }).then(() => 'error'),
  ]);
  if (passportResult === 'error') {
    step('passport.get-discoverable', `FAILED: ${await page.textContent('[data-testid="error"]')}`);
    throw new Error('discoverable get() failed at midnightpassport.test');
  }
  step('passport.get-discoverable', 'ok');
  const passportKey = await page.textContent('[data-testid="pubkey"]');
  step('passport.derived-public-key', passportKey);
  const readAddress = await page.textContent('[data-testid="acc-address"]');
  step('passport.attached-contract-address', readAddress);

  const keysMatch =
    nightfiKey === passportKey && P256_COMPRESSED_HEX.test(nightfiKey ?? '');
  const blobMatch = deployedAddress === readAddress && /^[0-9a-f]{64}$/u.test(readAddress ?? '');
  step('public-keys-match', keysMatch);
  step('contract-address-roundtrip', blobMatch);
  console.log(`\nRESULT ${JSON.stringify(summary, null, 2)}`);
  process.exitCode = keysMatch && blobMatch ? 0 : 1;
} finally {
  await browser.close();
  server.kill();
}
