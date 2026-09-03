import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served as https://nightfi.test via the local TLS front (Caddy in manual
// mode, e2e/serve.mjs in the automated run), which proxies to this port.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    allowedHosts: ['nightfi.test'],
  },
});
