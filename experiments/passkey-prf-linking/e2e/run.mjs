// Automated ROR + PRF continuity check.
//
// One Chromium page (a single CDP target, so the virtual authenticator and
// its resident credential persist across navigations):
//   1. https://nightfi.test        — create a passkey under RP ID
//      midnightpassport.test (the Related Origin Request), evaluate PRF,
//      derive the P-256 public key.
//   2. https://midnightpassport.test — discoverable-credential sign-in,
//      same PRF salt, derive again.
//   3. Assert both derived keys are identical.
//
// Requires the static server (e2e/serve.mjs) listening on 443 — the RP ID
// well-known fetch does not carry a port. Prints a JSON summary consumed by
// findings.md.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const summary = {
  date: new Date().toISOString().slice(0, 10),
  browser: null,
  authenticator: 'CDP virtual authenticator (ctap2, internal, hasPrf)',
  steps: {},
};

function step(name, value) {
  summary.steps[name] = value;
  console.log(`· ${name}: ${JSON.stringify(value)}`);
}

// Start the host-routing HTTPS server unless one is already up.
const server = spawn(process.execPath, [new URL('./serve.mjs', import.meta.url).pathname], {
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
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      hasPrf: true,
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
  step('nightfi.prf-evaluated-at-create', await page.textContent('[data-testid="prf-at-create"]'));
  const nightfiKey = await page.textContent('[data-testid="pubkey"]');
  step('nightfi.derived-public-key', nightfiKey);

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

  const match = nightfiKey === passportKey && Boolean(nightfiKey);
  step('public-keys-match', match);
  console.log(`\nRESULT ${JSON.stringify(summary, null, 2)}`);
  process.exitCode = match ? 0 : 1;
} finally {
  await browser.close();
  server.kill();
}
