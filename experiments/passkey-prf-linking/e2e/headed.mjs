// Interactive variant of run.mjs: opens a visible Chromium window with a
// CTAP 2.1 virtual authenticator (PRF + largeBlob) pre-installed, so the
// flow can be exercised manually even when the local Chrome's DevTools
// WebAuthn panel predates the PRF checkbox.
//
// Usage (from the experiment root, server bound to 443 — see README):
//   node e2e/headed.mjs
// or fully sudo-free inside a private network namespace (WSLg shows the
// window regardless — X/Wayland sockets are not network-namespaced):
//   unshare -r -n sh -c 'ip link set lo up && node e2e/headed.mjs'
//
// IMPORTANT: the virtual authenticator is attached to the FIRST tab only —
// do the whole flow in that tab (nightfi first, then edit the URL to
// midnightpassport.test; a new tab has no authenticator).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const server = spawn(process.execPath, [new URL('./serve.mjs', import.meta.url).pathname], {
  stdio: 'inherit',
});
await sleep(700);

const browser = await chromium.launch({
  headless: false,
  args: [
    '--host-resolver-rules=MAP midnightpassport.test 127.0.0.1, MAP nightfi.test 127.0.0.1',
    '--ignore-certificate-errors',
    '--no-sandbox',
  ],
});

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

await page.goto('https://nightfi.test/');
console.log(`
Virtual authenticator ready (CTAP 2.1 · PRF · largeBlob · resident keys · UV).
Work in THIS tab only:
  1. Click "Create your Midnight Passport" on nightfi.test.
  2. Change the URL to https://midnightpassport.test and click
     "Continue with Passkey".
Close the browser window (or Ctrl+C here) to finish.
`);

await new Promise((resolve) => browser.on('disconnected', resolve));
server.kill();
