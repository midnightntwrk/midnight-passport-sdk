// Screenshot harness for design review — drives the live Caddy dev front with
// a virtual authenticator and captures initial + post-action states of both
// apps. Not part of the experiment's evidence; a visual QA aid.
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--ignore-certificate-errors', '--no-sandbox'] });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1200, height: 1400 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: {
    protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal',
    hasResidentKey: true, hasUserVerification: true, isUserVerified: true,
    hasPrf: true, hasLargeBlob: true, automaticPresenceSimulation: true,
  },
});

async function shot(name) {
  await sleep(400);
  await page.screenshot({ path: `/tmp/shot-${name}.png`, fullPage: true });
  console.log(`shot-${name}.png`);
}

// NightFi
await page.goto('https://nightfi.test/', { waitUntil: 'networkidle' });
await sleep(600);
await shot('nightfi-1-initial');
await page.getByRole('button', { name: 'Create your Midnight Passport' }).click();
await Promise.race([
  page.waitForSelector('[data-testid="pubkey"]', { timeout: 15000 }),
  page.waitForSelector('[data-testid="error"]', { timeout: 15000 }),
]);
const nightfiKey = await page.textContent('[data-testid="pubkey"]');
await shot('nightfi-2-receipt');

// Passport
await page.goto('https://midnightpassport.test/', { waitUntil: 'networkidle' });
await sleep(600);
await shot('passport-1-initial');
await page.getByRole('button', { name: 'Continue with Passkey' }).click();
await page.waitForSelector('[data-testid="pubkey"]', { timeout: 15000 });
await page.fill('[data-testid="compare-input"]', (nightfiKey ?? '').trim());
await shot('passport-2-verified');

await browser.close();
