// HTTPS static server for the automated run: routes by Host header to the
// two built apps and serves the ROR well-known with the JSON content type.
// The RP ID well-known fetch always targets port 443, so run this on 443
// (see README for sudo-free options). Certificate is self-signed and local
// (gitignored); the e2e browser runs with --ignore-certificate-errors.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const certDir = join(here, '.certs');
const keyPath = join(certDir, 'key.pem');
const certPath = join(certDir, 'cert.pem');

if (!existsSync(keyPath)) {
  mkdirSync(certDir, { recursive: true });
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256',
    '-keyout', keyPath, '-out', certPath, '-days', '30', '-nodes',
    '-subj', '/CN=passkey-prf-experiment',
    '-addext', 'subjectAltName=DNS:midnightpassport.test,DNS:nightfi.test',
  ]);
  console.log('generated self-signed certificate in e2e/.certs/');
}

const hosts = {
  'midnightpassport.test': join(here, '..', 'passport', 'dist'),
  'nightfi.test': join(here, '..', 'nightfi', 'dist'),
};
const wellKnown = join(here, '..', 'passport', 'public', '.well-known', 'webauthn');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

const port = Number(process.env.PORT ?? 443);

const server = createServer(
  { key: readFileSync(keyPath), cert: readFileSync(certPath) },
  (req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    const root = hosts[host];
    if (!root) {
      res.writeHead(421).end('unknown host');
      return;
    }
    const path = new URL(req.url ?? '/', `https://${host}`).pathname;
    if (host === 'midnightpassport.test' && path === '/.well-known/webauthn') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(readFileSync(wellKnown));
      return;
    }
    let file = normalize(join(root, path));
    if (!file.startsWith(root) || !existsSync(file) || extname(file) === '') {
      file = join(root, 'index.html'); // SPA fallback
    }
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  },
);

server.listen(port, '127.0.0.1', () => {
  console.log(`serving nightfi.test + midnightpassport.test on https://127.0.0.1:${port}`);
});
