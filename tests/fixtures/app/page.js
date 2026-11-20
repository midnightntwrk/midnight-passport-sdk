import { browserPlatform } from '@midnight-ntwrk/mn-passport-adapter-browser';
import { owner, platform } from './app.js';
import { smoke } from '../../smoke.mjs';

window.result = (async () => {
  await platform.loadRuntimes();
  // A second platform must use the runtimes that are loaded, and fetch no WASM file again.
  await browserPlatform().loadRuntimes();
  const runtime = await import('@midnight-ntwrk/compact-runtime');
  const ledger = await import('@midnightntwrk/ledger-v9');
  const compiled = await import('../counter/compiled/contract/index.js');
  const result = await smoke(platform, location.origin + '/state', { runtime, ledger, compiled });
  // `typeof owner` keeps the owner package in the bundle, so the build checks it for the browser.
  return { ...result, owner: typeof owner };
})();
