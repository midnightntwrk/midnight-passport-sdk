// One-off sanity check for the minimised (bundled-extension) flow, driven
// against the already-running Caddy dev front (port 443) rather than spawning
// e2e/serve.mjs — so it exercises the live dev-server code the manual browser
// test uses. Counts WebAuthn ceremonies via CDP events to prove the reduction.
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  args: ['--ignore-certificate-errors', '--no-sandbox'],
});
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('WebAuthn.enable');
const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: {
    protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal',
    hasResidentKey: true, hasUserVerification: true, isUserVerified: true,
    hasPrf: true, hasLargeBlob: true, automaticPresenceSimulation: true,
  },
});

// Count credential-used events per phase as a ceremony proxy.
let ceremonies = 0;
cdp.on('WebAuthn.credentialAsserted', () => { ceremonies += 1; });
cdp.on('WebAuthn.credentialAdded', () => { ceremonies += 1; });

const out = { nightfiCeremonies: 0, passportCeremonies: 0 };

await page.goto('https://nightfi.test/', { waitUntil: 'networkidle' });
ceremonies = 0;
await page.getByRole('button', { name: 'Create your Midnight Passport' }).click();
await Promise.race([
  page.waitForSelector('[data-testid="pubkey"]', { timeout: 15000 }),
  page.waitForSelector('[data-testid="error"]', { timeout: 15000 }),
]);
await sleep(300);
out.nightfiCeremonies = ceremonies;
out.nightfiKey = await page.textContent('[data-testid="pubkey"]');
out.nightfiAddr = await page.textContent('[data-testid="acc-address"]');
out.nightfiBlobWritten = await page.textContent('[data-testid="blob-written"]');
out.nightfiSteps = await page.$$eval('[data-testid="steps"] li', (ls) => ls.map((l) => l.textContent));

await page.goto('https://midnightpassport.test/', { waitUntil: 'networkidle' });
ceremonies = 0;
await page.getByRole('button', { name: 'Continue with Passkey' }).click();
await Promise.race([
  page.waitForSelector('[data-testid="pubkey"]', { timeout: 15000 }),
  page.waitForSelector('[data-testid="error"]', { timeout: 15000 }),
]);
await sleep(300);
out.passportCeremonies = ceremonies;
out.passportKey = await page.textContent('[data-testid="pubkey"]');
out.passportAddr = await page.textContent('[data-testid="acc-address"]');
out.passportSteps = await page.$$eval('[data-testid="steps"] li', (ls) => ls.map((l) => l.textContent));

out.keysMatch = out.nightfiKey === out.passportKey && Boolean(out.nightfiKey);
out.addrRoundtrip = out.nightfiAddr === out.passportAddr && /^[0-9a-f]{64}$/u.test(out.passportAddr ?? '');

console.log(JSON.stringify(out, null, 2));
await browser.close();
process.exitCode = out.keysMatch && out.addrRoundtrip ? 0 : 1;
