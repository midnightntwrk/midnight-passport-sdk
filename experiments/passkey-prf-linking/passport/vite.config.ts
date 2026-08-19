import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Served as https://midnightpassport.test via the local TLS front. The
// browser fetches https://midnightpassport.test/.well-known/webauthn (always
// port 443) to authorise nightfi.test as a related origin, and requires an
// application/json content type — the middleware below guarantees it in dev
// (the file has no extension, so static serving would guess the type).
const wellKnownPath = fileURLToPath(new URL('./public/.well-known/webauthn', import.meta.url));

function wellKnownWebauthn(): Plugin {
  return {
    name: 'well-known-webauthn',
    configureServer(server) {
      server.middlewares.use('/.well-known/webauthn', (_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(readFileSync(wellKnownPath));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), wellKnownWebauthn()],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    allowedHosts: ['midnightpassport.test'],
  },
});
