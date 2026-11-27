import { browserPlatform } from '@midnight-ntwrk/mn-passport-adapter-browser';

window.result = (async () => {
  await browserPlatform().loadRuntimes();
  const { buildAccCall } = await import('@midnight-ntwrk/mn-passport-core/chain');
  // A call build loads these modules. They import `buffer` and `assert`.
  await import('@midnight-ntwrk/midnight-js/contracts');
  const { toHex } = await import('@midnight-ntwrk/midnight-js/utils');
  return { build: typeof buildAccCall, hex: toHex(Uint8Array.of(10, 255)) };
})();
